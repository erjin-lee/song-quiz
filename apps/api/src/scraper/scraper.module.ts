import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Album } from '../quiz/entities/album.entity';
import { Artist } from '../quiz/entities/artist.entity';
import { Song } from '../quiz/entities/song.entity';
import { MelonScraperClient } from './melon-scraper.client';
import { ScraperController } from './scraper.controller';
import { ScraperService } from './scraper.service';

@Module({
  imports: [TypeOrmModule.forFeature([Artist, Album, Song])],
  controllers: [ScraperController],
  providers: [ScraperService, MelonScraperClient],
})
export class ScraperModule {}
