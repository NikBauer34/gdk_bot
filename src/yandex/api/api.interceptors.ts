import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { ConfigService } from '@nestjs/config';

interface IamTokenResponse {
    iamToken: string;
    expiresAt: string;
}

export class YandexApiInterceptor<T = any, R = any> {
    private axiosInstance: AxiosInstance;
    private iamToken: string = '';
    private tokenExpirationTime: number | null = null;

    constructor(private readonly configService: ConfigService) {
        this.axiosInstance = axios.create({
            headers: {
                'Content-Type': 'application/json',
            },
        });

        this.setupInterceptors();
    }

    private async getIamToken(): Promise<string> {
        if (this.iamToken && this.tokenExpirationTime && Date.now() < this.tokenExpirationTime) {
            return this.iamToken;
        }

        const oauthToken = this.configService.get<string>('oauthToken');
        
        try {
            const response = await axios.post<IamTokenResponse>(
                'https://iam.api.cloud.yandex.net/iam/v1/tokens',
                { yandexPassportOauthToken: oauthToken },
                {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );

            this.iamToken = response.data.iamToken;
            this.tokenExpirationTime = Date.now() + (new Date(response.data.expiresAt).getTime() - Date.now());
            
            return this.iamToken;
        } catch (error) {
            console.error('Error getting IAM token:', error);
            throw error;
        }
    }

    private setupInterceptors(): void {
        this.axiosInstance.interceptors.request.use(
            async (config: InternalAxiosRequestConfig) => {
                const iamToken = await this.getIamToken();
                config.headers.Authorization = `Bearer ${iamToken}`;
                return config;
            },
            (error) => {
                return Promise.reject(error);
            }
        );
    }

    public getInstance(): AxiosInstance {
        return this.axiosInstance;
    }
}
