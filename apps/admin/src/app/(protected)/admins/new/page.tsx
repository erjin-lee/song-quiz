'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createAdmin } from '@/lib/admins';
import { ApiError } from '@/lib/api-client';
import type { CreateAdminResponseDto } from '@/types/admin';

export default function NewAdminPage() {
  const [loginId, setLoginId] = useState('');
  const [nickNm, setNickNm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdAdmin, setCreatedAdmin] = useState<CreateAdminResponseDto | null>(
    null,
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await createAdmin(loginId, nickNm);
      setCreatedAdmin(result);
    } catch (err) {
      setErrorMessage(
        err instanceof ApiError ? err.message : '관리자 생성에 실패했습니다.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">관리자 생성</h1>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>새 관리자 계정</CardTitle>
        </CardHeader>
        <CardContent>
          {createdAdmin ? (
            <div className="flex flex-col gap-4">
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-medium">
                  {createdAdmin.loginId} 계정이 생성되었습니다. 임시 비밀번호는
                  이 화면에서만 확인할 수 있으니 지금 전달하세요.
                </p>
                <p className="mt-1 font-mono text-base">
                  {createdAdmin.temporaryPassword}
                </p>
              </div>
              <Button asChild className="self-start">
                <Link href="/admins">목록으로</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="loginId">로그인 아이디</Label>
                <Input
                  id="loginId"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  autoComplete="off"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="nickNm">닉네임</Label>
                <Input
                  id="nickNm"
                  value={nickNm}
                  onChange={(e) => setNickNm(e.target.value)}
                  autoComplete="off"
                  required
                />
              </div>
              {errorMessage && (
                <p className="text-sm text-destructive">{errorMessage}</p>
              )}
              <div className="flex gap-2">
                <Button type="submit" disabled={submitting}>
                  {submitting ? '생성 중...' : '생성'}
                </Button>
                <Button type="button" variant="outline" asChild>
                  <Link href="/admins">취소</Link>
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
