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
      console.error(`Error parsing ${url}: ${error.message}`);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
  async parseEvents($: cheerio.CheerioAPI): Promise<string> {
    try {

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
              eventsString += `Событие: ${eventName}, дата: ${formattedDate}; `;
      });

      return eventsString.slice(0, -2);

  } catch (error) {
    console.error(`Ошибка при парсинге данных: ${error.message}`);
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
      resultString += `Новость: ${newsText.trim()}; `; // Добавляем к результирующей строке
    }
  });

  return resultString.trim();
}  catch (error) {
  console.error(`Ошибка при парсинге данных: ${error.message}`);
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

      // Извлекаем названия событий (из тегов <a> с классом 'item' внутри элемента с классом 'list-item')
      $eventPage('.list-item .item').each((i, el) => {
          const eventName = $eventPage(el).text().trim();
          eventNames.push(eventName);
      });

      if (eventNames.length > 0) {
          
            eventNames.forEach((el) => eventsString += `Событие: ${el} проходит: ${dateText}.${month}.${year}; `)
          
      }
  }
  console.log(eventsString);
  return eventsString;
} catch (error) {
console.error(`Ошибка при парсинге данных: ${error.message}`);
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
console.error(`Ошибка при парсинге данных: ${error.message}`);
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
        console.error('Error parsing posts:', error);
        throw new HttpException('Ошибка при получении постов', HttpStatus.INTERNAL_SERVER_ERROR);
    }
}
}
