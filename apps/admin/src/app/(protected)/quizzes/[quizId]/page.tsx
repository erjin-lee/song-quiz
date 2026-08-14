'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiError } from '@/lib/api-client';
import { getQuizSongs } from '@/lib/quiz';
import type { QuizSongItemDto } from '@/types/quiz';

export default function QuizSongsPage() {
  const params = useParams<{ quizId: string }>();
  const [songs, setSongs] = useState<QuizSongItemDto[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    getQuizSongs(params.quizId)
      .then(setSongs)
      .catch((err) => {
        setErrorMessage(
          err instanceof ApiError ? err.message : '출제곡 목록을 불러오지 못했습니다.',
        );
      });
  }, [params.quizId]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/quizzes" className="text-sm text-muted-foreground hover:underline">
          ← 퀴즈 목록
        </Link>
        <h1 className="text-xl font-bold">출제곡 목록</h1>
      </div>

      {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>순서</TableHead>
              <TableHead>곡 정보</TableHead>
              <TableHead>시작/종료(초)</TableHead>
              <TableHead>유튜브 링크</TableHead>
              <TableHead>정답</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {songs.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  출제곡이 없습니다.
                </TableCell>
              </TableRow>
            )}
            {songs.map((song) => (
              <TableRow key={song.quizSongId}>
                <TableCell>{song.quizSeq}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {song.songNm} - {song.atstNm}
                  <div className="text-xs text-muted-foreground">{song.albmNm}</div>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {song.startSec ?? '-'} / {song.endSec ?? '-'}
                </TableCell>
                <TableCell>
                  <a
                    href={song.youtubeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    링크
                  </a>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {song.answers.map((answer) => (
                      <Badge key={answer.quizAnswerId} variant="secondary">
                        {answer.answerTxt}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
