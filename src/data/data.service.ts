import { Injectable } from '@nestjs/common';
import { SectionsDataType } from './dto/sections.dto';

@Injectable()
export class DataService {
  private sectionsData: SectionsDataType[] = [];
  private postsData: {id: number, name: string, url: string, content: string, embedding: number[]}[] = [];

  setSectionsData(data: SectionsDataType[]): void {
    this.sectionsData = data;
  }

  getSectionsData(): SectionsDataType[] {
    return this.sectionsData;
  }

  getPostsData(): {id: number, name: string, url: string, content: string, embedding: number[]}[] {
    return this.postsData;
  }

  setPostsData(data: {id: number, name: string, url: string, content: string, embedding: number[]}[]): void {
    this.postsData = data;
  }
}
