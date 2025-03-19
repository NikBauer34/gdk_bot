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
      imageUrl: "https://postimg.su/image/ZueMwSkw/%D0%91%D0%B5%D0%B7%D0%B9.png",
      description: "Новые меороприятия"
    }, 
    {
      name: "Ресурсы, Ссылки",
      url: "https://kdk-krasnoturinsk.ru",
      user_url: "https://kdk-krasnoturinsk.ru/#logos-gallery",
      parserFunction: "parseLinks",
      imageUrl: "https://postimg.su/image/Znod1Gsy/%D0%91%D0%B5%D0%B7%D0%BC%D1%8F%D0%BD%D0%BD%D1%8B%D0%B9.png",
      description: "Ссылки на ресурсы"
    }
];