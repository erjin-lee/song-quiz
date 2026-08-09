export function PlayerCard() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 rounded-2xl bg-gradient-to-br from-purple-100 to-purple-50 px-6 py-16">
      <div className="relative flex h-40 w-40 items-center justify-center rounded-full bg-purple-200/70">
        <div className="absolute inset-2 rounded-full bg-purple-300/60" />
        <div className="absolute inset-6 rounded-full bg-purple-400/60" />
        <div className="absolute inset-10 rounded-full bg-purple-400/80" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-pink-400 text-white shadow-lg">
          <span className="ml-1 text-2xl">▶</span>
        </div>
      </div>
      <p className="text-sm text-slate-500">
        방장이 재생을 시작하면 문제가 나와요
      </p>
    </div>
  );
}
