'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getAdmins } from '@/lib/admins';
import { ApiError } from '@/lib/api-client';
import type { AdminItemDto } from '@/types/admin';

export default function AdminsPage() {
  const [admins, setAdmins] = useState<AdminItemDto[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    getAdmins()
      .then(setAdmins)
      .catch((err) => {
        setErrorMessage(
          err instanceof ApiError ? err.message : '관리자 목록을 불러오지 못했습니다.',
        );
      });
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">관리자 관리</h1>
        <Button asChild>
          <Link href="/admins/new">관리자 생성</Link>
        </Button>
      </div>

      {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>로그인 아이디</TableHead>
              <TableHead>닉네임</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>마지막 로그인</TableHead>
              <TableHead>생성일시</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {admins.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  관리자가 없습니다.
                </TableCell>
              </TableRow>
            )}
            {admins.map((admin) => (
              <TableRow key={admin.userId}>
                <TableCell>{admin.loginId}</TableCell>
                <TableCell>{admin.nickNm}</TableCell>
                <TableCell>{admin.status}</TableCell>
                <TableCell>
                  {admin.lastLoginDt
                    ? new Date(admin.lastLoginDt).toLocaleString()
                    : '-'}
                </TableCell>
                <TableCell>{new Date(admin.crtDt).toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
