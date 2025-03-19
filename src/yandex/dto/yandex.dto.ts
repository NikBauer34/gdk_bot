export class YandexCompDto {
    result: {
        alternatives: {
            message: {
                text: string
            }
        }[],
        usage: {
            promptTokens: number,
            completionTokens: number,
            totalTokens: number
        }
    }
}

export class YandexEmbeddingDto {

        embedding: number[]
        numTokens: number
}