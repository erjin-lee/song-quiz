import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from '../user/user.module';
import { AlbumArtist } from '../quiz/entities/album-artist.entity';
import { Album } from '../quiz/entities/album.entity';
import { Artist } from '../quiz/entities/artist.entity';
import { QuizSong } from '../quiz/entities/quiz-song.entity';
import { Quiz } from '../quiz/entities/quiz.entity';
import { SongArtist } from '../quiz/entities/song-artist.entity';
import { Song } from '../quiz/entities/song.entity';
import { QuizModule } from '../quiz/quiz.module';
import { ArtistLinkService } from './artist-link.service';
import { ChartScraperController } from './chart-scraper.controller';
import { ChartScraperService } from './chart-scraper.service';
import { MelonScraperClient } from './melon-scraper.client';
import { MelonSongSearchController } from './melon-song-search.controller';
import { MelonSongSearchService } from './melon-song-search.service';
import { ScraperController } from './scraper.controller';
import { ScraperService } from './scraper.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Artist,
      Album,
      Song,
      Quiz,
      QuizSong,
      SongArtist,
      AlbumArtist,
    ]),
    QuizModule,
    UserModule,
  ],
  controllers: [
    ScraperController,
    ChartScraperController,
    MelonSongSearchController,
  ],
  providers: [
    ScraperService,
    ChartScraperService,
    MelonScraperClient,
    ArtistLinkService,
    MelonSongSearchService,
  ],
})
export class ScraperModule {}
