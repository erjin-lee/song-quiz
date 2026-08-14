'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { changeMyPassword, getMe, updateMyProfile } from '@/lib/admins';
import { ApiError } from '@/lib/api-client';
import type { AdminMeDto } from '@/types/admin';

export default function SettingsPage() {
  const [me, setMe] = useState<AdminMeDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [nickNm, setNickNm] = useState('');
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  useEffect(() => {
    getMe()
      .then((result) => {
        setMe(result);
        setNickNm(result.nickNm);
      })
      .catch((err) => {
        setLoadError(
          err instanceof ApiError ? err.message : '내 정보를 불러오지 못했습니다.',
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const handleProfileSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setProfileSubmitting(true);
    setProfileError(null);
    setProfileSuccess(false);
    try {
      const result = await updateMyProfile(nickNm);
      setMe(result);
      setNickNm(result.nickNm);
      setProfileSuccess(true);
    } catch (err) {
      setProfileError(
        err instanceof ApiError ? err.message : '닉네임 수정에 실패했습니다.',
      );
    } finally {
      setProfileSubmitting(false);
    }
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword !== newPasswordConfirm) {
      setPasswordError('새 비밀번호가 일치하지 않습니다.');
      return;
    }

    setPasswordSubmitting(true);
    try {
      await changeMyPassword(currentPassword, newPassword);
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setNewPasswordConfirm('');
    } catch (err) {
      setPasswordError(
        err instanceof ApiError ? err.message : '비밀번호 변경에 실패했습니다.',
      );
    } finally {
      setPasswordSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">불러오는 중...</p>;
  }

  if (loadError || !me) {
    return (
      <p className="text-sm text-destructive">
        {loadError ?? '내 정보를 불러오지 못했습니다.'}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">설정</h1>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>내 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleProfileSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>USER ID</Label>
              <Input value={me.userId} disabled readOnly />
            </div>
            <div className="flex flex-col gap-2">
              <Label>로그인 아이디</Label>
              <Input value={me.loginId} disabled readOnly />
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
            {profileError && (
              <p className="text-sm text-destructive">{profileError}</p>
            )}
            {profileSuccess && (
              <p className="text-sm text-emerald-600">닉네임이 수정되었습니다.</p>
            )}
            <Button type="submit" disabled={profileSubmitting} className="self-start">
              {profileSubmitting ? '저장 중...' : '저장'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>비밀번호 변경</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="currentPassword">현재 비밀번호</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="newPassword">새 비밀번호</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="newPasswordConfirm">새 비밀번호 확인</Label>
              <Input
                id="newPasswordConfirm"
                type="password"
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            {passwordError && (
              <p className="text-sm text-destructive">{passwordError}</p>
            )}
            {passwordSuccess && (
              <p className="text-sm text-emerald-600">비밀번호가 변경되었습니다.</p>
            )}
            <Button
              type="submit"
              disabled={passwordSubmitting}
              className="self-start"
            >
              {passwordSubmitting ? '변경 중...' : '변경'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
