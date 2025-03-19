export default () => ({
    port: parseInt(process.env.PORT || '3000', 10),
    vkToken: process.env.VK_TOKEN,
    // yandexApiKey: process.env.YANDEX_API_KEY,
    yandexApiModelUriEmb: process.env.YANDEX_API_MODEL_URI_EMB,
    yandexApiModelUriComp: process.env.YANDEX_API_MODEL_URI_COMP,
    sectionsDataUpdateInterval: parseInt(process.env.SECTIONS_DATA_UPDATE_INTERVAL || '604800000', 10), // 7 дней   
    postgresUrl: process.env.POSTGRES_URL || '',
    oauthToken: process.env.OAUTH_TOKEN || '',
    adminPassword: process.env.ADMIN_PASSWORD || '',
    workerPassword: process.env.WORKER_PASSWORD || '',
    VK_GROUP_ID: process.env.VK_GROUP_ID || '',
});