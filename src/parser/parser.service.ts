import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import * as cheerio from 'cheerio'
import axios, { AxiosResponse } from 'axios';
import { ConfigService } from '@nestjs/config';
import { SECTIONS } from 'src/config/sections';
@Injectable()
export class ParserService {
  constructor(private readonly configService: ConfigService) {}
 
  async parseSection(url: string, parserFunction: string): Promise<string> {
    try {
      const response = await axios.get(url);
      const html = response.data;
      const $ = cheerio.load(html);

      //Получаем результат динамически вызванной функции
      const parsingFunction = this[parserFunction];
      console.log({'function': parserFunction, 'url': url})
      if(!parsingFunction) throw new Error(`Parsing function ${parserFunction} not found`);
      return await parsingFunction($);

    } catch (error) {
      console.error(`Error in parseSection while parsing ${url}: ${error.message}`);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
  async parseEvents($: cheerio.CheerioAPI): Promise<string> {
    try {
       function translateDate(dateString) {
        const dateParts = dateString.split('-');
        const year = parseInt(dateParts[0], 10);
        const month = parseInt(dateParts[1], 10);
        const day = parseInt(dateParts[2], 10);
      
        const months = [
          "января", "февраля", "марта", "апреля", "мая", "июня",
          "июля", "августа", "сентября", "октября", "ноября", "декабря"
        ];
      
        return `${day} ${months[month - 1]} ${year}`;
      }
      let eventsString = "";
      const currentDate = new Date();
      const monthLater = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, currentDate.getDate());

      $('#events-slider .one-link').each((index, element) => {
          const eventName = $(element).find('.caption').text().trim();
          const eventDateString = $(element).find('.date').text().trim();

          // Парсинг даты без moment.js
          const eventDateParts = eventDateString.split('-');
          const eventYear = parseInt(eventDateParts[0]);
          const eventMonth = parseInt(eventDateParts[1]) - 1; // Месяцы в JavaScript начинаются с 0
          const eventDay = parseInt(eventDateParts[2]);
          const eventDate = new Date(eventYear, eventMonth, eventDay);

          if (isNaN(eventDate.getTime())) {
              console.warn(`Не удалось распарсить дату "${eventDateString}" для события "${eventName}".`);
              return;
          }

              const formattedDate = `${eventDate.getFullYear()}-${(eventDate.getMonth() + 1).toString().padStart(2, '0')}-${eventDate.getDate().toString().padStart(2, '0')}`;
              console.log(formattedDate, eventName)
              
              eventsString += `Событие: ${eventName}, дата: ${translateDate(formattedDate)}; `;
      });

      return eventsString.slice(0, -2);

  } catch (error) {
    console.error(`Error in parseEvents: ${error.message}`);
    throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
async parseNews($: cheerio.CheerioAPI): Promise<string> {
try {
  let resultString = "";
  const newsItems = $('.item-content.img-less, .item-content').slice(0, 10); //выбираем оба класса, и обрезаем до лимита
  
  newsItems.each((index, element) => {
    let newsText = "";
    $(element).find('p').each((i, p) => {
      newsText += $(p).text().trim() + " "; // Собираем текст из всех <p> внутри элемента
    });

    if (newsText) {
      resultString += `Новость: ${newsText.trim().replace('Афиша', '')}; `; // Добавляем к результирующей строке
    }
  });

  return resultString.trim();
}  catch (error) {
  console.error(`Error in parseNews: ${error.message}`);
  throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
}

}

async parseDateEvents($calendar: cheerio.CheerioAPI): Promise<string> {
  function joinUrl(baseUrl: string, relativeUrl: string) {
    if (typeof baseUrl !== 'string' || typeof relativeUrl !== 'string') {
      throw new Error('Both baseUrl and relativeUrl must be strings.');
    }
  
    // Remove trailing slashes from the base URL.
    const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  
    // Remove leading slashes from the relative URL.
    const relative = relativeUrl.startsWith('/') ? relativeUrl.slice(1) : relativeUrl;
  
    // Combine the base and relative parts.
    return `${base}/${relative}`;
  }
try {
  let eventsString = '';

  // Находим все даты, которые имеют ссылки (тег <a> внутри элемента с классом calendar-cell)
  const linkedDates = $calendar('.calendar-cell > a');

  for (let i = 0; i < linkedDates.length; i++) {
      const element = linkedDates[i];
      const dateLink = $calendar(element).attr('href');
      const dateText = $calendar(element).text().trim();

      if (!dateLink) {
          continue; // Пропускаем, если у элемента нет атрибута href
      }
      console.log({'dateLink': dateLink})
      const needed = SECTIONS.find(section => section.name === 'Мероприятия')
      const absoluteDateLink = joinUrl(needed?.url ?? '', dateLink) // Преобразуем относительный URL в абсолютный
      console.log({'absoluteDateLink': absoluteDateLink})
      // Получаем HTML страницы события
      const response = await axios.get(absoluteDateLink );
      const html = response.data;
      const $eventPage = cheerio.load(html);
      const now = new Date();
      const month = String(now.getMonth() + 1).padStart(2, '0'); // Получаем номер месяца (0-11), добавляем 1, форматируем
  const year = now.getFullYear();
      let eventNames: string[] = [];
      function translateDate(dateString) {
        const dateParts = dateString.split('-');
        const year = parseInt(dateParts[0], 10);
        const month = parseInt(dateParts[1], 10);
        const day = parseInt(dateParts[2], 10);
      
        const months = [
          "января", "февраля", "марта", "апреля", "мая", "июня",
          "июля", "августа", "сентября", "октября", "ноября", "декабря"
        ];
      
        return `${day} ${months[month - 1]} ${year}`;
      }

      // Извлекаем названия событий (из тегов <a> с классом 'item' внутри элемента с классом 'list-item')
      $eventPage('.list-item .item').each((i, el) => {
          const eventName = $eventPage(el).text().trim();
          eventNames.push(eventName);
      });

      if (eventNames.length > 0) {
          console.log(year + '-' + month + '-' + dateText.padStart(2, '0'))
            eventNames.forEach((el) => eventsString += `Событие: ${el} проходит: ${translateDate(year + '-' + month + '-' + dateText.padStart(2, '0'))} `)
          
      }
  }
  console.log(eventsString);
  return eventsString;
} catch (error) {
console.error(`Error in parseDateEvents: ${error.message}`);
throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
}
}
async parseLinks($: cheerio.CheerioAPI): Promise<string> {
try {
  let resourcesString = '';

  // Находим все элементы <a> с классом 'one-link' внутри блока с id 'logos-gallery'
  $('#logos-gallery a.one-link').each((index, element) => {
      const $link = $(element);

      // Извлекаем название ресурса из элемента с классом 'caption'
      const resourceName = $link.find('.caption').text().trim();

      // Извлекаем ссылку из элемента с классом 'link'
      const resourceLink = $link.find('.link').text().trim();

      if (resourceName && resourceLink) {
          resourcesString += `Ресурс: ${resourceName}, Ссылка: ${resourceLink};`;
      }
  });

  return resourcesString;
} catch (error) {
console.error(`Error in parseLinks: ${error.message}`);
throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
}
}

async parsePosts(groupId: string, groupNumber: string): Promise<string> {
    try {
        const currentDate = new Date();
        const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const access_token = this.configService.getOrThrow<string>('VK_ACCESS_TOKEN');
        const response: AxiosResponse<{response: {items: {text?: string, id: number, date: number}[]}}> = await axios.get(
          `https://api.vk.com/method/wall.get?access_token=${access_token}&count=7&owner_id=${groupId}&v=5.131`);

        if (!response.data.response || !response.data.response.items) {
            throw new Error('Invalid response from VK API');
        }

        const posts = response.data.response.items
            .filter((post: any) => new Date(post.date * 1000) >= firstDayOfMonth)
            .map((post: any) => {
                console.log(`Found post with ID: ${post.id}`);
                const text = (post.text || '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
                const attachments = post.attachments || [];
                const postUrl = `https://vk.com/${groupId}?w=wall${groupNumber}_${post.id}`;

                return `Пост: ${text} | ID: ${post.id} | URL: ${postUrl}`;
            })
            .join('\n'); // Use newline as separator instead of comma

        return posts;
    } catch (error) {
        console.error(`Error in parsePosts: ${error.message}`);
        throw new HttpException('Ошибка при получении постов', HttpStatus.INTERNAL_SERVER_ERROR);
    }
}

async parseStructure($: cheerio.CheerioAPI): Promise<string> {
  try {
    function parseCultureDivisions($: cheerio.CheerioAPI) {
      const divisions: string[] = [];

      // Выбираем элемент div с классом 'description' и ищем в нем все span с font-size: 18pt
      $('.description span[style*="font-size: 18pt"]').each((index, element) => {
        const text = $(element).text().trim();

        // Проверяем, что текст начинается с дефиса или является допустимым именем подразделения
        if (text.startsWith('-') || text.includes('Краснотурьинск')) {
          // Удаляем дефис и лишние пробелы в начале строки
          const division = text.replace(/^-?\s*/, '').trim();

          // Добавляем только непустые строки
          if (division) {
            divisions.push(division);
          }
        }
      });

      // Фильтрация и корректировка названий (зависит от структуры HTML)

      // Соединяем названия подразделений в строку, разделенную пробелами
      return divisions.join(' ');
    }

    const structureInfo = parseCultureDivisions($);
    return structureInfo;
  } catch (error) {
    console.error(`Error in parseStructure: ${error.message}`);
    throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

async parseFilesListLinks($: cheerio.CheerioAPI): Promise<string> {
  try {
    function joinUrl(baseUrl: string, relativeUrl: string) {
      if (typeof baseUrl !== 'string' || typeof relativeUrl !== 'string') {
        throw new Error('Both baseUrl and relativeUrl must be strings.');
      }
    
      // Remove trailing slashes from the base URL.
      const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    
      // Remove leading slashes from the relative URL.
      const relative = relativeUrl.startsWith('/') ? relativeUrl.slice(1) : relativeUrl;
    
      // Combine the base and relative parts.
      return `${base}/${relative}`;
    }
    const links: string[] = [];

    // Находим все элементы <a> внутри div с классом std-files-list
    $('.std-files-list a.file').each((index, element) => {
      const href = $(element).attr('href') || ''; // Получаем атрибут href
      const filename = $(element).find('.caption span').text().trim(); // Получаем имя файла из caption
      const needed = SECTIONS.find(section => section.name === 'Мероприятия')
      const absoluteDateLink = joinUrl(needed?.url ?? '', href)
      links.push(`Файл:${filename}, Ссылка:${absoluteDateLink}`); // Формируем строку в нужном формате
    });

    // Соединяем все строки ссылок в одну, разделенную точкой с запятой
    return links.join('; ');
  } catch (error) {
    console.error(`Error in parseFilesListLinks: ${error.message}`);
    throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

async parseEventsFromPage($: cheerio.CheerioAPI): Promise<string> {
  try {
    async function parseEventDetails(url: string): Promise<{ title: string; date: string }[]> {
      try {
        function formatArchiveDate(dateString: string): string {
          if (!dateString) return '';
        
          const parts = dateString.replace('-', '').trim().split('.');
          if (parts.length !== 3) return dateString;
        
          const day = parseInt(parts[0], 10);
          const monthIndex = parseInt(parts[1], 10) - 1;
          const year = parseInt(parts[2], 10);
        
          const months = [
            'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
            'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
          ];
        
          if (isNaN(day) || isNaN(monthIndex) || isNaN(year) || day < 1 || day > 31 || monthIndex < 0 || monthIndex > 11) {
            return dateString;
          }
        
          return `${day} ${months[monthIndex]} ${year} год`;
        }
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        const events: { title: string; date: string }[] = [];
    
        $('.list-item').each((i, el) => {
          const title = $(el).find('.caption a').text().trim();
          let dateText = $(el).find('.item-content p.date').text().trim();
          const date = formatArchiveDate(dateText);
    
          if (title && date) {
            events.push({ title, date });
          }
        });
    
        return events;
      } catch (error) {
        console.error(`Error in parseEventDetails while fetching data from ${url}: ${error.message}`);
        return [];
      }
    }
    const archiveLinks: { url: string; text: string }[] = [];

    // Находим все ссылки на архивы мероприятий
    $('p a[href][target="_blank"]').each((i, el) => {
      let href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href?.length && href.length < 10){
        href = 'https://kdk-krasnoturinsk.ru' + href
      }
      if (text.toUpperCase().includes('АРХИВ') && href) {
        archiveLinks.push({ url: href, text });
      }
    });

    let resultString = '';
    console.log('archiveLinks')
    console.log(archiveLinks)

    for (const linkData of archiveLinks) {
      try {
        const { url, text } = linkData;
        const events = await parseEventDetails(url);
        if (events && events.length > 0) {
          const eventString = events.map(event => `${event.title} (${event.date})`).join(', ');

          let houseOfCulture = 'Неизвестный ДК';
          if (text.toUpperCase().includes('ГОРОДСКОГО ДВОРЦА')) {
            houseOfCulture = 'Городской дворец';
          } else if (text.toUpperCase().includes('ДК "ИНДЕКС"')) {
            houseOfCulture = 'ДК "индекс"';
          } else if (text.toUpperCase().includes('ЦК "ШАНС"')) {
            houseOfCulture = 'ЦК "шанс"';
          }
          if (eventString.includes('2024')){
            resultString += `${houseOfCulture}: ${eventString}; `;
          }
          
        }
      } catch (error) {
        console.error(`Error in parseEventsFromPage while processing link ${linkData.url}: ${error.message}`);
      }
    }
    
    return resultString.trim().slice(0, -1).substring(0, 350);
  } catch (error) {
    console.error(`Error in parseEventsFromPage: ${error.message}`);
    throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}


parseAfisha($: cheerio.CheerioAPI) {
  let resultString = '';

  $('.item-content.pub-item').each((index, element) => {
    const $element = $(element);
    const text = $element.find('.caption a.item').text().trim();
    const link = $element.find('.caption a.item').attr('href');

    if (text && link) {
      resultString += `Афиша: ${text}, ссылка: ${'https://kdk-krasnoturinsk.ru' + link}; `;
    }
  });

  return resultString.trim().slice(0, -1); // Убираем последний символ (";") и пробел.
}
parsePhoneSpans($: cheerio.CheerioAPI) {
  const phoneTexts: string[] = [];

  $('div.description > div > span').each((index, element) => {
    const $element = $(element);
    const text = $element.text().trim();

    if (text.toLowerCase().startsWith('телефон')) {
      phoneTexts.push(text);
    }
  });

  return phoneTexts.join(' ');
}
async parseCollectives($: cheerio.CheerioAPI, baseUrl = 'https://kdk-krasnoturinsk.ru') {
  async function parseCollectiveDetails(url: string) {
    try {
      const response = await axios.get(url);
      const $ = cheerio.load(response.data);
  
      let scheduleLink = 'нет';
      let awardsLink = 'нет';
  
      $('div.description a').each((index, element) => {
        const $element = $(element);
        const text = $element.text().trim().toUpperCase();
        const href = $element.attr('href');
  
        if (text.includes('РАСПИСАНИЕ ЗАНЯТИЙ')) {
          scheduleLink = href ? baseUrl + href : 'нет'; //  Проверка на null/undefined
        } else if (text.includes('НАГРАДЫ КОЛЛЕКТИВА')) {
          awardsLink = href ? baseUrl + href : 'нет'; // Проверка на null/undefined
        }
      });
  
      return { scheduleLink, awardsLink };
    } catch (error) {
      console.error(`Ошибка при загрузке или парсинге страницы коллектива ${url}:`, error);
      return { scheduleLink: 'нет', awardsLink: 'нет' }; // Возвращаем значения по умолчанию в случае ошибки
    }
  }
  let resultString = '';

  for (const element of $('.list-item').toArray()) {
    const $element = $(element);
    const linkContainer = $element.find('a.link-container');
    const name = $element.find('span.caption').text().trim();
    const relativeLink = linkContainer.attr('href');

    if (name && relativeLink) {
      const absoluteLink = baseUrl + relativeLink; // Формируем абсолютный URL
      const { scheduleLink, awardsLink } = await parseCollectiveDetails(absoluteLink);

      resultString += `Коллектив: ${name}, описание: ${absoluteLink}, расписание занятий (ссылка): ${scheduleLink}, награды коллектива (ссылка): ${awardsLink}; `;
    }
  }

  return resultString.trim().slice(0, -1); // Убираем последний символ (";") и пробел.
}



}
