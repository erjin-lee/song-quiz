'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiError } from '@/lib/api-client';
import { getQuizzes } from '@/lib/quiz';
import type { QuizListItemDto } from '@/types/quiz';

export default function QuizListPage() {
  const [quizzes, setQuizzes] = useState<QuizListItemDto[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    getQuizzes()
      .then(setQuizzes)
      .catch((err) => {
        setErrorMessage(
          err instanceof ApiError ? err.message : '퀴즈 목록을 불러오지 못했습니다.',
        );
      });
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">퀴즈 관리</h1>

      {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>퀴즈명</TableHead>
              <TableHead>설명</TableHead>
              <TableHead>플레이 횟수</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quizzes.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  퀴즈가 없습니다.
                </TableCell>
              </TableRow>
            )}
            {quizzes.map((quiz) => (
              <TableRow key={quiz.quizId}>
                <TableCell>
                  <Link
                    href={`/quizzes/${quiz.quizId}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {quiz.quizTtl}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {quiz.quizDesc ?? '-'}
                </TableCell>
                <TableCell>{quiz.playCnt}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
