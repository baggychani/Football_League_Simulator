import { useEffect, useRef, useState, type ReactNode } from 'react';
import marketSnapshot from '../data/default-market.json';

const pages = [
  { id: 'overview', number: '01', label: '전체 흐름', hint: '시장이 시즌이 되는 과정' },
  { id: 'market', number: '02', label: '시장 → 기반 전력', hint: 'Polymarket을 B로 바꾸기' },
  { id: 'match', number: '03', label: '한 경기 생성', hint: '전력에서 스코어까지' },
  { id: 'layers', number: '04', label: 'B · C · F', hint: '세 시간축의 역할' },
  { id: 'seasons', number: '05', label: '시즌 간 변화', hint: '티어와 장기 성장' },
  { id: 'records', number: '06', label: '이변과 기록', hint: '서로 다른 희귀성' },
  { id: 'reading', number: '07', label: '숫자 읽는 법', hint: '지표와 모델의 한계' },
] as const;

const rawMarketTotal = Object.values(marketSnapshot).reduce((sum, value) => sum + value, 0);
const arsenalRaw = marketSnapshot.arsenal;
const cityRaw = marketSnapshot['man-city'];
const percent = (value: number, digits = 1) => `${(100 * value).toFixed(digits)}%`;

function Formula({
  label,
  children,
  note,
}: {
  label: string;
  children: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="guide-formula">
      <span>{label}</span>
      <strong>{children}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}

function Callout({
  title,
  children,
  tone = 'plain',
}: {
  title: string;
  children: ReactNode;
  tone?: 'plain' | 'important' | 'caution';
}) {
  return (
    <aside className={`guide-callout ${tone}`}>
      <b>{title}</b>
      <p>{children}</p>
    </aside>
  );
}

function SectionTitle({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <header className="guide-page-title">
      <p>{kicker}</p>
      <h3>{title}</h3>
      <div>{children}</div>
    </header>
  );
}

function OverviewPage() {
  return (
    <>
      <SectionTitle kicker="먼저 큰 그림부터" title={<>시장의 전망이 한 시즌의 축구가 되기까지</>}>
        이 모델은 우승확률을 곧바로 경기 승률로 쓰지 않습니다. 시장은 시즌 전체의 출발점을
        정하고, 경기 모델은 그 출발점에서 매 경기의 득점과 결과를 새로 만듭니다.
      </SectionTitle>

      <Callout title="한 문장으로 요약하면" tone="important">
        Polymarket 우승확률에 맞는 장기 전력 <code>B</code>를 역으로 찾은 뒤, 중기 상태{' '}
        <code>C</code>와 단기 폼 <code>F</code>를 얹어 매 경기의 기대득점과 실제 스코어를
        생성합니다.
      </Callout>

      <ol className="guide-process" aria-label="모델 계산 순서">
        <li>
          <span>1</span>
          <div>
            <b>시장 가격을 읽습니다</b>
            <p>20개 팀의 EPL 우승 Yes 가격을 하나의 스냅샷으로 모읍니다.</p>
          </div>
        </li>
        <li>
          <span>2</span>
          <div>
            <b>합계가 100%가 되도록 정규화합니다</b>
            <p>시장 마진과 반올림 때문에 생긴 초과분을 모든 팀에 비례해 제거합니다.</p>
          </div>
        </li>
        <li>
          <span>3</span>
          <div>
            <b>우승확률을 재현하는 기반 전력 B를 찾습니다</b>
            <p>38경기 시즌을 반복해 돌리고, 모의 우승 비율이 시장 목표에 가까워지도록 B를 조정합니다.</p>
          </div>
        </li>
        <li>
          <span>4</span>
          <div>
            <b>경기 직전 전력으로 기대득점을 계산합니다</b>
            <p>홈과 원정의 현재 전력 차이를 홈·원정 기대득점 λ로 변환합니다.</p>
          </div>
        </li>
        <li>
          <span>5</span>
          <div>
            <b>두 포아송 분포에서 실제 스코어를 뽑습니다</b>
            <p>승·무·패를 먼저 정하지 않습니다. 두 팀의 골 수가 먼저 나오고 결과는 그 뒤에 결정됩니다.</p>
          </div>
        </li>
        <li>
          <span>6</span>
          <div>
            <b>결과가 다음 경기와 다음 시즌에 흔적을 남깁니다</b>
            <p>이번 시즌에는 F가, 시즌이 끝난 뒤에는 C와 B가 서로 다른 속도로 움직입니다.</p>
          </div>
        </li>
      </ol>

      <Callout title="시장 우승확률 ≠ 한 경기 승리확률">
        예를 들어 우승확률 30%는 “모든 경기를 30% 확률로 이긴다”는 뜻이 아닙니다. 일정, 홈
        어드밴티지, 무승부, 경쟁 팀의 강도까지 포함한 전체 시즌을 반복했을 때 약 30%가 우승해야
        한다는 목표입니다.
      </Callout>
    </>
  );
}

function MarketPage() {
  return (
    <>
      <SectionTitle kicker="출발점 만들기" title={<>Polymarket 확률을 기반 전력 B로 바꾸는 법</>}>
        가장 중요한 부분입니다. 시장 가격을 정리한 뒤, 그 우승확률을 실제 리그 시뮬레이션이
        재현하도록 팀별 잠재 전력을 역산합니다.
      </SectionTitle>

      <section className="guide-explainer">
        <h4>1. 각 팀의 Yes 가격을 수집합니다</h4>
        <p>
          Polymarket의 EPL 우승 이벤트에서 활성 상태인 팀별 시장을 읽고, 이름을 시뮬레이터의
          팀 ID와 연결합니다. 시장에 일시적으로 빠진 팀이 있으면 0으로 없애지 않고 직전 저장
          스냅샷의 값을 보완해 사용합니다.
        </p>
        <Callout title="여기서 얻는 것은 ‘의견의 출발점’입니다" tone="caution">
          가격에는 시장 참여자의 정보와 심리, 유동성, 수수료성 마진이 함께 들어 있습니다. 이
          모델은 그것을 객관적 진실로 선언하지 않고, 시즌 시작 시점의 사전 전망으로 사용합니다.
        </Callout>
      </section>

      <section className="guide-explainer">
        <h4>2. 합계를 100%로 다시 맞춥니다</h4>
        <p>
          팀별 Yes 가격은 독립 시장이어서 합계가 정확히 100%일 이유가 없습니다. 현재 저장된
          스냅샷의 원시 합계도 <b>{percent(rawMarketTotal, 2)}</b>입니다. 그래서 각 팀 가격을 전체
          합으로 나눕니다.
        </p>
        <Formula
          label="시장 정규화"
          note="모든 팀에 같은 비율을 적용하므로 시장의 순서는 유지됩니다."
        >
          pᵢ = rawᵢ ÷ Σⱼ rawⱼ
        </Formula>
        <div className="guide-worked-example">
          <p className="guide-example-label">현재 스냅샷으로 보는 실제 예</p>
          <div>
            <span>아스널 원시 가격</span>
            <b>{percent(arsenalRaw)}</b>
          </div>
          <div>
            <span>전체 팀 원시 가격 합</span>
            <b>{percent(rawMarketTotal, 2)}</b>
          </div>
          <div className="result">
            <span>정규화된 아스널 목표</span>
            <b>{percent(arsenalRaw / rawMarketTotal, 2)}</b>
          </div>
          <small>
            맨시티도 같은 방식으로 {percent(cityRaw)} ÷ {percent(rawMarketTotal, 2)} ={' '}
            {percent(cityRaw / rawMarketTotal, 2)}가 됩니다.
          </small>
        </div>
      </section>

      <section className="guide-explainer">
        <h4>3. 로그 확률로 첫 전력 후보를 만듭니다</h4>
        <p>
          우승확률 차이는 선형이 아닙니다. 2%와 1%의 차이는 31%와 30%의 차이보다 상대적으로
          훨씬 큽니다. 그래서 확률 자체가 아니라 로그 확률을 사용합니다. 리그 평균을 빼서 전체
          평균이 0이 되게 하고, 배율 <code>s</code>가 다른 여러 출발 후보를 비교합니다.
        </p>
        <Formula label="로그 시장 출발점">
          Bᵢ⁽⁰⁾(s) = s · [log(pᵢ) − mean(log p)]
        </Formula>
        <p>
          이 값은 화면의 0–100 능력치가 아니라 득점 모델 안에서 쓰는 <b>잠재 좌표</b>입니다.
          모든 팀에 같은 수를 더해도 전력 차이는 변하지 않으므로, 평균 0으로 중심을 고정합니다.
        </p>
      </section>

      <section className="guide-explainer">
        <h4>4. 시즌을 반복하며 B를 역보정합니다</h4>
        <p>
          후보 B로 정규 38경기 일정을 수천~수십만 시즌 재생합니다. 팀 i의 모의 우승 비율{' '}
          <code>p̂ᵢ</code>와 시장 목표 <code>pᵢ</code>의 차이를 보고 B를 조금 움직인 뒤 다시
          시뮬레이션합니다. 이 보정 단계에서는 B의 의미를 깨끗하게 맞추기 위해 C와 F, 시즌 간
          동적 갱신을 끄고 한 시즌 내내 같은 B를 사용합니다.
        </p>
        <Formula label="보정의 목표" note="작은 확률 팀에는 더 작은 절대 허용오차를 적용합니다.">
          p̂ᵢ(B) ≈ pᵢ
        </Formula>
        <ul className="guide-detail-list">
          <li><b>같은 난수 묶음</b>을 재사용해 전력 조정 전후의 차이가 우연한 표본 흔들림에 묻히지 않게 합니다.</li>
          <li><b>Huber 손실</b>로 큰 오차는 바로잡되 한 팀의 표본 잡음이 전체 탐색을 지배하지 않게 합니다.</li>
          <li><b>LM/Broyden 갱신</b>으로 어느 팀의 B를 움직였을 때 우승확률이 얼마나 반응하는지 근사합니다.</li>
          <li><b>시장 순서 투영</b>으로 더 낮은 우승확률의 팀이 더 높은 B를 갖는 역전을 막고, 같은 가격 팀은 같은 티어로 묶습니다.</li>
          <li><b>독립 검증</b>에서는 기본 20만 시즌을 돌리고 경계가 애매하면 최대 30만 시즌까지 늘립니다.</li>
        </ul>
      </section>

      <Callout title="왜 가격을 단순히 0–100으로 환산하지 않나요?" tone="important">
        우승은 20팀이 공유하는 비선형 결과입니다. 강팀 한 곳의 B를 높이면 그 팀의 우승확률만
        오르는 것이 아니라 다른 19팀의 확률이 함께 내려갑니다. 따라서 전체 일정과 경기 생성
        규칙을 통과한 뒤 시장 분포가 재현되는 B를 찾아야 합니다.
      </Callout>
    </>
  );
}

function MatchPage() {
  return (
    <>
      <SectionTitle kicker="경기 생성기" title={<>전력 차이가 90분의 스코어가 되는 과정</>}>
        매 경기는 킥오프 직전의 두 팀 전력만 받아 새로 계산됩니다. 과거의 이름값이나 티어가
        별도의 승리 보너스로 끼어들지는 않습니다.
      </SectionTitle>

      <section className="guide-explainer">
        <h4>1. 경기 직전의 유효 전력을 만듭니다</h4>
        <Formula label="현재 잠재 전력">R = B + C + 0.5F</Formula>
        <p>
          장기 기반 B와 중기 상태 C는 전부 반영하고, 빠르게 흔들리는 단기 폼 F는 절반만
          반영합니다. 따라서 연승은 다음 경기의 기대치를 올리지만 시장에서 보정한 장기 체급을
          단번에 뒤집지는 못합니다.
        </p>
      </section>

      <section className="guide-explainer">
        <h4>2. 너무 큰 전력 차이는 부드럽게 눌러 줍니다</h4>
        <Formula label="전력 차이 포화">
          δ = R홈 − R원정   →   δ* = 2.45 · tanh(δ ÷ 2.45)
        </Formula>
        <p>
          <code>tanh</code>는 작은 차이는 거의 그대로 두고, 극단적인 차이만 매끄럽게
          제한합니다. 하드 클램프처럼 어느 지점에서 갑자기 계산법이 꺾이지 않습니다.
        </p>
      </section>

      <section className="guide-explainer">
        <h4>3. 홈·원정 기대득점 λ를 계산합니다</h4>
        <Formula label="독립 포아송 기대득점">
          λ홈 = 1.34 · exp(0.14 + δ*)<br />
          λ원정 = 1.34 · exp(−0.14 − δ*)
        </Formula>
        <div className="guide-worked-example compact">
          <p className="guide-example-label">두 팀 전력이 같다면</p>
          <div><span>홈 기대득점</span><b>약 1.54골</b></div>
          <div><span>원정 기대득점</span><b>약 1.16골</b></div>
          <small>전력 차이가 0이어도 홈 어드밴티지 0.14가 양쪽 기대득점에 반대 방향으로 작용합니다.</small>
        </div>
      </section>

      <section className="guide-explainer">
        <h4>4. 골 수를 먼저 뽑고 승·무·패는 나중에 읽습니다</h4>
        <Formula label="스코어 생성">
          G홈 ~ Poisson(λ홈),   G원정 ~ Poisson(λ원정)
        </Formula>
        <p>
          두 골 수는 현재 모델에서 서로 독립입니다. 예를 들어 2–1의 확률은 홈이 정확히 2골을
          넣을 확률과 원정이 정확히 1골을 넣을 확률의 곱입니다. 가능한 스코어를 합하면 경기 전
          홈승·무승부·원정승 확률도 얻을 수 있습니다.
        </p>
        <Callout title="승패를 먼저 뽑은 뒤 그럴듯한 스코어를 붙이는 방식이 아닙니다">
          0–0, 1–0, 2–1, 5–4 모두 같은 득점 생성 규칙에서 나옵니다. 그래서 정확한 스코어의
          희귀성과 승리 자체의 희귀성을 한 분포 안에서 일관되게 비교할 수 있습니다.
        </Callout>
      </section>
    </>
  );
}

function LayersPage() {
  return (
    <>
      <SectionTitle kicker="서로 다른 시간축" title={<>B, C, F는 무엇이 다르고 언제 바뀌나</>}>
        세 값은 모두 전력에 들어가지만 의미와 수명이 다릅니다. 한 경기의 우연이 곧바로 클럽의
        장기 체급이 되지 않도록 변화 속도를 분리했습니다.
      </SectionTitle>

      <div className="guide-layer-list">
        <article>
          <span>B</span>
          <div>
            <p className="guide-layer-meta">장기 기반 · 여러 시즌</p>
            <h4>클럽의 느린 중심</h4>
            <p>
              최초에는 시장 우승확률을 재현하도록 보정됩니다. 이후에는 같은 방향의 시즌 성과가
              반복될 때만 아주 천천히 변합니다. 한 번의 깜짝 우승이나 부진만으로 크게 움직이지
              않습니다.
            </p>
          </div>
        </article>
        <article>
          <span>C</span>
          <div>
            <p className="guide-layer-meta">중기 상태 · 대략 1–4시즌</p>
            <h4>최근 몇 시즌의 상승세와 침체</h4>
            <p>
              시즌이 끝날 때 갱신되고 다음 시즌으로 일부 이월됩니다. 좋은 흐름도 나쁜 흐름도
              영구적이지 않으며 시간이 지나면 0 쪽으로 되돌아갑니다.
            </p>
          </div>
        </article>
        <article>
          <span>F</span>
          <div>
            <p className="guide-layer-meta">단기 폼 · 현재 시즌</p>
            <h4>예상을 벗어난 경기 결과의 누적</h4>
            <p>
              단순 승패가 아니라 경기 전 기대와 실제 결과의 차이로 움직입니다. 약팀의 예상 밖
              승리는 큰 양의 충격이고, 압도적 강팀의 평범한 승리는 작은 충격입니다.
            </p>
          </div>
        </article>
      </div>

      <section className="guide-explainer">
        <h4>경기 한 번이 F에 들어가는 방식</h4>
        <p>
          먼저 경기 전 기대 결과를 <code>q = P(승) + 0.5P(무)</code>로 계산합니다. 실제 결과
          <code>y</code>는 승리 1, 무승부 0.5, 패배 0입니다. 여기에 실제 골 차가 기대 골 차를
          얼마나 벗어났는지 표준화한 <code>d</code>를 작은 보정으로 더합니다.
        </p>
        <Formula label="경기 충격">
          u = 0.75(y − q) + 0.25 · tanh(d ÷ 2)
        </Formula>
        <p>
          결과 자체가 75%, 스코어의 압도성이 25%입니다. 따라서 5–0은 1–0보다 더 큰 흔적을
          남기지만, 골 차만으로 폼이 폭주하지는 않습니다.
        </p>
      </section>

      <section className="guide-explainer">
        <h4>연승은 쌓이고, 방향이 바뀌면 더 빨리 꺾입니다</h4>
        <Formula label="모멘텀과 폼">
          Z다음 = ρZ현재 + u   ·   F = 0.27 · tanh(0.9Z)
        </Formula>
        <ul className="guide-detail-list">
          <li>같은 방향의 결과가 이어지면 이전 모멘텀의 <b>82%</b>를 남깁니다.</li>
          <li>연승 뒤 패배처럼 방향이 바뀌면 <b>45%</b>만 남아 흐름이 빠르게 꺾입니다.</li>
          <li>F는 최대치가 정해진 포화 함수라 연승·연패 효과가 무한히 커지지 않습니다.</li>
          <li>실제 경기 R에는 F의 절반만 들어가므로 최대 영향도 다시 제한됩니다.</li>
        </ul>
      </section>

      <Callout title="공식 ‘최대 이변’ 기록과 폼 충격 u는 다른 숫자입니다" tone="caution">
        u는 다음 경기의 단기 상태를 갱신하기 위한 내부 신호입니다. 기록 순위의 이변 지수는
        별도의 조건부 우도비 꼬리확률로 계산하며, 둘을 섞지 않습니다.
      </Callout>
    </>
  );
}

function SeasonsPage() {
  return (
    <>
      <SectionTitle kicker="시즌이 끝난 뒤" title={<>반짝 돌풍과 진짜 체질 변화를 구분하는 법</>}>
        38경기에서 쌓인 충격을 평균내고, 과거 시즌과 같은 방향이 반복되었는지 확인한 뒤 B와 C를
        서로 다른 속도로 갱신합니다.
      </SectionTitle>

      <section className="guide-explainer">
        <h4>1. 이번 시즌의 평균 성과를 만듭니다</h4>
        <Formula label="시즌 성과">
          S = 시즌 동안 누적한 u ÷ 경기 수
        </Formula>
        <p>
          승점이나 순위 자체가 아니라 “매 경기 기대보다 얼마나 잘했는가”의 평균입니다. 강팀의
          준우승과 약팀의 준우승이 같은 성과로 처리되지 않는 이유입니다.
        </p>
      </section>

      <section className="guide-explainer">
        <h4>2. 같은 방향이 반복될수록 일관성 A가 커집니다</h4>
        <Formula label="다년 흐름">
          H다음 = 0.72H현재 + S
        </Formula>
        <p>
          이번 시즌 S와 직전까지의 흐름 H가 같은 부호일 때 일관성 계수 A가 양수가 됩니다.
          지난해 돌풍 뒤 곧바로 평범해지면 A가 거의 생기지 않지만, 여러 시즌 계속 기대를
          웃돌면 A가 커집니다.
        </p>
      </section>

      <section className="guide-explainer">
        <h4>3. C는 비교적 빠르게, B는 아주 느리게 움직입니다</h4>
        <div className="guide-comparison">
          <div>
            <b>중기 C</b>
            <p>기본 이월률은 0.62이고, 새 시즌 성과의 갱신 계수는 0.08입니다. 최근 흐름을 반영하되 계속 남지는 않습니다.</p>
          </div>
          <div>
            <b>장기 B</b>
            <p>일관성이 있을 때만 갱신되며 계수는 0.015입니다. 시장으로 정한 출발 체급이 한 시즌 만에 무너지지 않게 설계했습니다.</p>
          </div>
        </div>
      </section>

      <section className="guide-explainer">
        <h4>4. 티어는 경기 보너스가 아니라 구조적 회복력입니다</h4>
        <div className="guide-tier-list">
          <div><span>1티어</span><p>맨시티 · 리버풀 · 첼시 · 맨유 · 아스널</p></div>
          <div><span>2티어</span><p>토트넘 · 뉴캐슬 · 아스톤 빌라</p></div>
          <div><span>0티어</span><p>그 밖의 모든 팀</p></div>
        </div>
        <p>
          티어는 경기 직전 R에 더해지지 않고 승리확률이나 이변 지수에도 직접 들어가지 않습니다.
          나쁜 중기 상태가 얼마나 오래 남는지, 장기 B가 초기 기반 아래로 떨어졌을 때 얼마나
          부드럽게 복원되는지에만 관여합니다.
        </p>
      </section>

      <section className="guide-explainer">
        <h4>5. 0티어 팀도 획득 지위 E를 만들 수 있습니다</h4>
        <p>
          기대 이상의 시즌이 여러 해 이어지면 양의 장기 런이 쌓이고, 일관성이 확인될 때 획득
          지위 E가 증가합니다. 반대로 침체가 이어지거나 시간이 지나면 줄어듭니다. 구조적
          지원에는 <code>clip(티어 + E, 0, 1)</code>가 쓰이므로 신흥 강팀도 점차 비슷한
          회복력을 얻을 수 있습니다.
        </p>
      </section>

      <Callout title="시즌 종료 후에도 리그 평균은 그대로 유지됩니다">
        경기 모델은 절대값이 아니라 팀 간 차이만 사용합니다. 그래서 B를 모두 갱신한 뒤 리그
        평균이 0이 되도록 다시 중심을 맞춰 공통 드리프트가 진단값에 스며들지 않게 합니다.
      </Callout>
    </>
  );
}

function RecordsPage() {
  return (
    <>
      <SectionTitle kicker="기록은 한 줄로 세우지 않습니다" title={<>‘큰 승리’, ‘희귀한 스코어’, ‘이변’의 차이</>}>
        같은 5–0이라도 무엇을 묻느냐에 따라 기록의 의미가 다릅니다. 그래서 서로 다른 통계량을
        별도 카테고리로 보존합니다.
      </SectionTitle>

      <div className="guide-record-list">
        <article>
          <span>골 차</span>
          <div>
            <h4>최대 점수 차 승리</h4>
            <p>실제 골 차가 큰 경기부터 정렬합니다. 강팀의 대승도 포함하며, 순수하게 스코어보드의 격차를 묻습니다.</p>
          </div>
        </article>
        <article>
          <span>P(스코어)</span>
          <div>
            <h4>가장 희귀한 스코어</h4>
            <p>홈과 원정의 정확한 포아송 확률을 곱합니다. 어느 팀이 이겼는지보다 그 숫자 조합 자체가 얼마나 드문지를 묻습니다.</p>
          </div>
        </article>
        <article>
          <span>P(승)</span>
          <div>
            <h4>최저 승리확률 승리</h4>
            <p>킥오프 직전 승리확률이 가장 낮았던 승리를 찾습니다. 스코어의 압도성은 1차 기준이 아닙니다.</p>
          </div>
        </article>
        <article className="featured">
          <span>B</span>
          <div>
            <h4>가장 압도적인 언더독 승리</h4>
            <p>총득점을 고정한 조건부 이항분포에서 언더독이 실제만큼 많은 골을 가져갈 상측 꼬리확률을 사용합니다.</p>
          </div>
        </article>
        <article className="featured">
          <span>I</span>
          <div>
            <h4>최대 이변</h4>
            <p>현재 스코어 이상으로 극단적인 모든 언더독 승리 스코어의 전체 확률을 합합니다.</p>
          </div>
        </article>
      </div>

      <section className="guide-explainer">
        <h4>언더독의 자격은 경기 전에 결정됩니다</h4>
        <p>
          실제 승리 팀의 경기 전 승리확률 <code>pW</code>가 패한 팀의 승리확률{' '}
          <code>pL</code>보다 작을 때만 언더독 승리입니다. 10%p, 30% 같은 임의의 최소 격차는
          없습니다. 전력과 Tier도 경기 결과로 갱신하기 <b>전에</b> 캡처해 기록 메타데이터에
          남깁니다.
        </p>
      </section>

      <section className="guide-explainer">
        <h4>가장 압도적인 언더독 승리 B</h4>
        <Callout title="기호가 겹치지만 서로 다른 값입니다" tone="caution">
          이 절의 화면 표기 B는 blowout의 희귀성 지수입니다. 앞 장에서 설명한 장기 기반 전력
          B와는 관계가 없습니다. 아래에서는 혼동을 피하려고 <code>B압도</code>로 적습니다.
        </Callout>
        <p>
          두 팀이 합쳐 n골을 넣었다고 고정하면, 언더독 득점 X는 성공확률{' '}
          <code>π = λU ÷ (λU + λF)</code>인 이항분포가 됩니다. 실제 언더독 득점 이상을 가져갈
          확률을 모두 더합니다.
        </p>
        <Formula label="조건부 득점 배분 꼬리">
          p배분 = P(X ≥ gU | X ~ Binomial(n, π))<br />
          B압도 = −log₁₀(p배분)
        </Formula>
        <div className="guide-worked-example">
          <p className="guide-example-label">기대득점 0.6 대 2.4인 언더독이 5–0으로 이겼다면</p>
          <div><span>언더독의 기대 골 점유율 π</span><b>0.6 ÷ 3.0 = 0.20</b></div>
          <div><span>5골을 모두 가져갈 조건부 확률</span><b>0.20⁵ = 0.00032</b></div>
          <div className="result"><span>백분율로</span><b>0.032%</b></div>
        </div>
        <p>
          동률이면 ① 배분 꼬리확률이 더 작음 ② 경기 전 승리확률 비율 격차가 더 큼 ③ 실제 골
          차가 더 큼 ④ 정확한 스코어 확률이 더 작음 순서로 비교합니다.
        </p>
      </section>

      <section className="guide-explainer">
        <h4>공식 최대 이변 I</h4>
        <p>
          관측 스코어의 득점 배분이 사전 기대와 얼마나 어긋났는지 조건부 우도비 편차 D로
          측정합니다. 그다음 현재 홈·원정 포아송 분포에서 <b>언더독이 이기면서 D가 관측값
          이상인 모든 스코어</b>의 확률을 합합니다.
        </p>
        <Formula label="조건부 우도비와 전체 꼬리">
          D = 2n · KL(q̂ ∥ π)<br />
          I = −log₁₀ P(언더독 승리, D ≥ D관측)
        </Formula>
        <p>
          I가 4라면 현재 모델에서 같은 정도 이상으로 극단적인 언더독 승리는 대략 10⁻⁴, 즉
          1만 경기당 한 번 꼴이라는 뜻입니다. 이것은 현실 전체에 대한 보편 법칙이 아니라 해당
          경기 직전 모델 분포 안에서의 해석입니다.
        </p>
      </section>

      <Callout title="왜 B와 I를 둘 다 두나요?" tone="important">
        B는 “총 n골 중 언더독이 얼마나 비정상적으로 큰 몫을 가져갔나”에 집중합니다. I는
        총득점이 달라질 수 있는 전체 스코어 공간까지 다시 합산합니다. 따라서 압도적 언더독
        승리와 종합적으로 가장 극단적인 이변을 서로 중복되지 않는 질문으로 볼 수 있습니다.
      </Callout>
    </>
  );
}

function ReadingPage() {
  return (
    <>
      <SectionTitle kicker="화면의 숫자를 읽는 법" title={<>0–100 능력치와 확률은 무엇을 뜻하나</>}>
        내부 계산은 평균 0의 잠재 전력을 쓰지만, 화면에는 사람이 비교하기 쉬운 0–100
        지수로 다시 표현합니다.
      </SectionTitle>

      <section className="guide-explainer">
        <h4>능력치 0–100은 중립 구장 기대 결과 지수입니다</h4>
        <Formula label="화면 능력치">
          100 × 다른 19팀 상대 평균 [P(승) + 0.5P(무)]
        </Formula>
        <p>
          각 팀을 다른 모든 팀과 중립 구장에서 한 번씩 붙인다고 가정합니다. 50은 리그
          평균적인 상대와 대등한 좌표이고, 60은 “모든 경기에서 60% 승률”이라는 뜻이 아니라
          승리 1점·무승부 0.5점으로 본 평균 기대 결과가 0.60이라는 뜻입니다.
        </p>
      </section>

      <div className="guide-reading-list">
        <article>
          <b>기반</b>
          <p>B만 0–100으로 변환한 장기 체급입니다.</p>
        </article>
        <article>
          <b>폼 제외</b>
          <p>B + C를 변환한 값입니다. 최근 몇 시즌의 상태까지 보되 현재 시즌의 단기 열기는 뺍니다.</p>
        </article>
        <article>
          <b>현재</b>
          <p>B + C + 0.5F를 변환한 실제 경기 직전 기준입니다.</p>
        </article>
        <article>
          <b>λ</b>
          <p>그 경기에서 해당 팀이 넣을 것으로 기대되는 평균 골 수입니다. 예측 스코어 그 자체는 아닙니다.</p>
        </article>
        <article>
          <b>I 또는 B</b>
          <p>꼬리확률 p를 −log₁₀(p)로 바꾼 희귀성 지수입니다. 값이 1 커질 때 확률은 10분의 1이 됩니다.</p>
        </article>
      </div>

      <section className="guide-explainer">
        <h4>같은 시드는 같은 역사를 재현합니다</h4>
        <p>
          난수 생성은 시드에 의해 결정됩니다. 같은 설정과 같은 시드로 시작하면 경기 스코어와
          그에 따른 폼·시즌 변화도 같은 순서로 재현됩니다. 모델을 비교하거나 특이한 시즌을 다시
          확인할 때 유용합니다.
        </p>
      </section>

      <section className="guide-limitations">
        <h4>이 모델이 의도적으로 단순화한 것</h4>
        <ul>
          <li>홈·원정 득점을 독립 포아송으로 두므로 저득점 상관, 경기 상태 변화, 퇴장 효과를 직접 모델링하지 않습니다.</li>
          <li>부상, 이적, 감독, 전술, 유럽대항전 피로 같은 현실 사건은 별도 입력으로 받지 않습니다.</li>
          <li>초기 B는 시장 스냅샷에 의존하므로 시장이 틀리거나 얕으면 그 편향도 출발점에 남습니다.</li>
          <li>티어는 정해진 구조적 관성 가정이며, 실제 구단 재정이나 선수단 데이터를 실시간으로 읽은 값이 아닙니다.</li>
          <li>표시된 확률과 희귀성은 이 모델 내부에서 일관된 비교값이지 현실의 절대 확률을 보증하는 예언이 아닙니다.</li>
        </ul>
      </section>

      <Callout title="가장 안전한 읽기" tone="important">
        결과 하나를 정답처럼 보기보다, 여러 시드에서 어떤 팀이 얼마나 자주 우승하고 어떤
        경로로 상승·하락하는지 분포와 반복 패턴을 보는 시뮬레이터입니다.
      </Callout>
    </>
  );
}

function GuidePage({ index }: { index: number }) {
  switch (pages[index].id) {
    case 'overview': return <OverviewPage />;
    case 'market': return <MarketPage />;
    case 'match': return <MatchPage />;
    case 'layers': return <LayersPage />;
    case 'seasons': return <SeasonsPage />;
    case 'records': return <RecordsPage />;
    case 'reading': return <ReadingPage />;
  }
}

export function ModelGuide({ onClose }: { onClose: () => void }) {
  const [pageIndex, setPageIndex] = useState(0);
  const contentRef = useRef<HTMLElement>(null);
  const page = pages[pageIndex];

  const goToPage = (next: number) => {
    setPageIndex(Math.max(0, Math.min(pages.length - 1, next)));
  };

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    contentRef.current?.focus({ preventScroll: true });
  }, [pageIndex]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches('input, textarea, select, [contenteditable="true"]');
      if (event.key === 'Escape') onClose();
      if (!typing && event.key === 'ArrowLeft') goToPage(pageIndex - 1);
      if (!typing && event.key === 'ArrowRight') goToPage(pageIndex + 1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, pageIndex]);

  return (
    <div
      className="modal guide-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="model-guide-title"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <article className="guide">
        <header className="guide-shell-header">
          <div>
            <p className="eyebrow">MODEL NOTES · 상세 해설</p>
            <h2 id="model-guide-title">시장에서 스코어까지</h2>
            <p>모델이 판단하는 순서대로, 한 장씩 읽는 가이드</p>
          </div>
          <div className="guide-progress" aria-label={`${pageIndex + 1} / ${pages.length}장`}>
            <b>{page.number}</b>
            <span>/ {String(pages.length).padStart(2, '0')}</span>
          </div>
          <button className="guide-close" type="button" onClick={onClose} aria-label="모델 노트 닫기">×</button>
        </header>

        <div className="guide-shell-body">
          <nav className="guide-nav" aria-label="모델 노트 목차">
            <p>차례</p>
            {pages.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={index === pageIndex ? 'active' : ''}
                aria-current={index === pageIndex ? 'page' : undefined}
                onClick={() => goToPage(index)}
              >
                <span>{item.number}</span>
                <div>
                  <b>{item.label}</b>
                  <small>{item.hint}</small>
                </div>
              </button>
            ))}
          </nav>

          <main
            ref={contentRef}
            className="guide-content"
            tabIndex={-1}
            aria-label={`${page.number}. ${page.label}`}
          >
            <GuidePage index={pageIndex} />
          </main>
        </div>

        <footer className="guide-footer">
          <button
            type="button"
            onClick={() => goToPage(pageIndex - 1)}
            disabled={pageIndex === 0}
          >
            ← 이전 장
          </button>
          <p><b>{page.label}</b><span>{page.hint}</span></p>
          <button
            type="button"
            onClick={() => goToPage(pageIndex + 1)}
            disabled={pageIndex === pages.length - 1}
          >
            다음 장 →
          </button>
        </footer>
      </article>
    </div>
  );
}
