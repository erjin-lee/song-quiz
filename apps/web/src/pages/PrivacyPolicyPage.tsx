import { Logo } from '../components/Logo';
import { useDocumentMeta } from '../hooks/useDocumentMeta';

const CONTACT_EMAIL = 'noraemat.site@gmail.com';
const EFFECTIVE_DATE = '2026년 8월 13일';

export function PrivacyPolicyPage() {
  useDocumentMeta({
    title: '개인정보처리방침 | 노래맞히기',
    description:
      '노래맞히기 서비스가 수집·이용하는 개인정보의 항목, 목적, 보관 기간과 광고(Google AdSense) 관련 안내입니다.',
  });

  return (
    <div className="min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header>
          <Logo size="md" />
        </header>

        <div className="flex flex-col gap-8 rounded-3xl bg-white p-6 text-sm leading-relaxed text-slate-600 shadow-sm sm:p-10">
          <div>
            <h1 className="text-lg font-bold text-slate-800">
              개인정보처리방침
            </h1>
            <p className="mt-2 text-slate-400">
              시행일자: {EFFECTIVE_DATE}
            </p>
          </div>

          <p>
            노래맞히기(이하 &ldquo;서비스&rdquo;)는 별도의 회원가입 없이
            닉네임만으로 이용할 수 있는 실시간 노래 맞히기 게임 서비스입니다.
            서비스는 이용자의 개인정보를 소중히 다루며, 아래와 같이
            개인정보를 수집·이용합니다.
          </p>

          <section className="flex flex-col gap-2">
            <h2 className="font-bold text-slate-800">
              1. 수집하는 개인정보 항목 및 수집 방법
            </h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <span className="font-semibold text-slate-700">닉네임</span> —
                이용자가 서비스 이용을 위해 직접 입력하며, 브라우저
                localStorage에 저장되고 방 입장 시 서버로 전송되어 참가자
                표시·채팅 등에 사용됩니다.
              </li>
              <li>
                <span className="font-semibold text-slate-700">
                  이용자 식별자(userId)
                </span>{' '}
                — 방 입장 시 서버가 실명·계정과 무관하게 임의로 발급하는
                식별값입니다.
              </li>
              <li>
                <span className="font-semibold text-slate-700">
                  방 세션 정보
                </span>{' '}
                — 새로고침 후에도 게임에 재접속할 수 있도록 방 번호와
                이용자 식별자를 브라우저 localStorage에 저장합니다.
              </li>
              <li>
                <span className="font-semibold text-slate-700">
                  채팅 메시지
                </span>{' '}
                — 게임 진행 중 다른 참가자에게 실시간으로 표시되며, 서버
                메모리에 방이 종료될 때까지 일시적으로만 보관되고 별도
                데이터베이스에 저장되지 않습니다.
              </li>
              <li>
                <span className="font-semibold text-slate-700">
                  곡 문의 내용
                </span>{' '}
                — 이용자가 게임 중 자유롭게 남기는 문의 텍스트로, 문의
                처리를 위해 데이터베이스에 저장되며 자동 분류·응답 처리를
                위해 아래 제3항의 위탁업체로 전송됩니다.
              </li>
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-bold text-slate-800">
              2. 개인정보의 이용 목적 및 보유 기간
            </h2>
            <p>
              수집한 정보는 게임 참가자 식별, 실시간 채팅·참가자 목록 표시,
              곡 정정·오류 문의 접수 및 처리, 서비스 품질 개선 목적으로만
              이용합니다.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                닉네임과 방 세션 정보는 이용자의 브라우저에만 저장되며,
                이용자가 직접 브라우저 데이터를 삭제하기 전까지 유지됩니다.
              </li>
              <li>
                채팅 메시지는 방이 종료되면 즉시 삭제됩니다.
              </li>
              <li>
                곡 문의 내용은 문의 처리가 완료된 후에도 문의 이력 관리 및
                서비스 개선 목적으로 일정 기간 보관 후 파기합니다.
              </li>
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-bold text-slate-800">
              3. 개인정보의 제3자 제공 및 처리위탁
            </h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <span className="font-semibold text-slate-700">OpenAI</span> —
                곡 문의 내용의 자동 분류 및 응답 처리를 위해 문의 텍스트를
                OpenAI에 전송합니다. OpenAI의 개인정보 처리에 관한 사항은
                OpenAI의 자체 개인정보처리방침을 따릅니다.
              </li>
              <li>
                <span className="font-semibold text-slate-700">
                  Google AdSense
                </span>{' '}
                — 서비스는 광고 게재를 위해 Google AdSense를 이용하며,
                Google 및 광고 파트너는 쿠키, 광고 식별자 등을 통해 얻은
                정보를 이용해 맞춤형 광고를 제공할 수 있습니다. 자세한
                내용은 Google의{' '}
                <a
                  href="https://policies.google.com/technologies/partner-sites"
                  target="_blank"
                  rel="noreferrer"
                  className="text-purple-600 underline"
                >
                  파트너 사이트 정보 이용 방식
                </a>
                을 참고하시기 바랍니다.
              </li>
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-bold text-slate-800">
              4. 쿠키 및 광고 맞춤 설정
            </h2>
            <p>
              서비스는 자체적으로 쿠키를 사용하지 않으며, 닉네임·방 세션
              정보만 브라우저 localStorage에 저장합니다. 다만 광고 게재
              과정에서 Google 및 광고 파트너가 쿠키·기기 식별자 등을 사용할
              수 있으며, 이용자는{' '}
              <a
                href="https://adssettings.google.com"
                target="_blank"
                rel="noreferrer"
                className="text-purple-600 underline"
              >
                Google 광고 설정
              </a>
              에서 맞춤형 광고 수신을 거부할 수 있습니다.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-bold text-slate-800">5. 이용자의 권리</h2>
            <p>
              닉네임 등 브라우저에 저장된 정보는 브라우저 설정에서 직접
              삭제할 수 있습니다. 문의 내용 등 서버에 보관 중인 개인정보의
              열람·정정·삭제를 원하는 경우 아래 연락처로 요청할 수 있습니다.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-bold text-slate-800">
              6. 개인정보 관련 문의처
            </h2>
            <p>
              개인정보 처리와 관련한 문의는 아래 이메일로 연락해 주시기
              바랍니다.
            </p>
            <p className="font-semibold text-slate-700">{CONTACT_EMAIL}</p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-bold text-slate-800">7. 고지의 의무</h2>
            <p>
              본 개인정보처리방침의 내용이 변경되는 경우 변경 사항을 본
              페이지를 통해 고지합니다.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
