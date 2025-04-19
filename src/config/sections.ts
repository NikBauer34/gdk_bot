export const SECTIONS: {name: string, url: string, imageUrl: string, description: string, parserFunction: string, user_url: string}[] = [
    {
      name: "События",
      url: "https://kdk-krasnoturinsk.ru",
      user_url: "https://kdk-krasnoturinsk.ru/#events-slider",
      parserFunction: "parseEvents",
      imageUrl: "https://i.postimg.cc/2q2LC1hn/image.png",
      description: "Новые концерты, выступления"
    },
    {
      name: "Новости",
      url: "https://kdk-krasnoturinsk.ru",
      user_url: "https://kdk-krasnoturinsk.ru/#index-greetings",
      parserFunction: "parseNews",
      imageUrl: "https://i.postimg.cc/Kk7GmVdw/jggj.png",
      description: "происшествия, опросы"
    },
    {
      name: "Мероприятия",
      url: "https://kdk-krasnoturinsk.ru",
      user_url: "https://kdk-krasnoturinsk.ru/#c-left-menu",
      parserFunction: "parseDateEvents",
      imageUrl: "https://i.postimg.cc/KjCnJwLm/six.png",
      description: "Новые меороприятия"
    }, 
    {
      name: "Ресурсы, Ссылки",
      url: "https://kdk-krasnoturinsk.ru",
      user_url: "https://kdk-krasnoturinsk.ru/#logos-gallery",
      parserFunction: "parseLinks",
      imageUrl: "https://i.postimg.cc/h4dmbSMd/oo.png",
      description: "Ссылки на ресурсы"
    },
    {
      name: "Структура",
      url: "https://kdk-krasnoturinsk.ru/structure",
      user_url: "https://kdk-krasnoturinsk.ru/structure/#content",
      parserFunction: "parseStructure",
      imageUrl: "https://i.postimg.cc/PrsJQYFW/io.png",
      description: "Здания ГДК"
    },
    {
      name: "УЧРЕДИТЕЛЬНЫЕ ДОКУМЕНТЫ",
      url: "https://kdk-krasnoturinsk.ru/activities",
      user_url: "https://kdk-krasnoturinsk.ru/activities/#content",
      parserFunction: "parseFilesListLinks",
      imageUrl: "https://i.postimg.cc/TY0y2hCn/seven.png",
      description: "файлы"
    },
    {
      name: "Архив событий",
      url: "https://kdk-krasnoturinsk.ru/documents",
      user_url: "https://kdk-krasnoturinsk.ru/documents/#content",
      parserFunction: "parseEventsFromPage",
      imageUrl: "https://i.postimg.cc/9fgms7XQ/ei.png",
      description: "Прошедшие события"
    },
    {
      name: "Афиша",
      url: "https://kdk-krasnoturinsk.ru/servicies",
      user_url: "https://kdk-krasnoturinsk.ru/servicies/#content",
      parserFunction: "parseAfisha",
      imageUrl: "https://i.postimg.cc/pVYpWkZm/ten.png",
      description: "АФИШИ ГДК"
    },
    {
      name: "Телефоны",
      url: "https://kdk-krasnoturinsk.ru/contacts",
      user_url: "https://kdk-krasnoturinsk.ru/contacts/#content",
      parserFunction: "parsePhoneSpans",
      imageUrl: "https://i.postimg.cc/0Q7d2mW9/elev.png",
      description: "Контакты"
    },
    {
      name: "Коллективы",
      url: "https://kdk-krasnoturinsk.ru/media",
      user_url: "https://kdk-krasnoturinsk.ru/media/#content",
      parserFunction: "parseCollectives",
      imageUrl: "https://i.postimg.cc/yxZhxGVg/twel.png",
      description: "Коллективы ГДК, расписания занятий, награды"
    }
];