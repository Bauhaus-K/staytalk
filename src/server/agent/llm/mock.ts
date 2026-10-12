import type {
  AgentContentBlock,
  AgentMessage,
  AgentTurnRequest,
  AgentTurnResponse,
  CompletionRequest,
  CompletionResponse,
  LlmClient,
} from "./types";
import { ZERO_USAGE } from "./types";
import { isGuestLanguage, type GuestLanguage } from "@/server/language/codes";

/**
 * Deterministic stand-in for the main model (AI_MODE=mock). It follows the
 * same protocol as the real agent — calls search_knowledge, answers from the
 * results with a <sources> line, escalates when nothing matches — using
 * keyword rules instead of language understanding. Good enough for local
 * development, E2E tests and wiring checks; not a quality signal.
 */

type Topic = { triggers: RegExp; query: Record<"ko" | "ja", string> };

// Maps a guest question in any supported language to keywords in the
// knowledge base language (the real model does this translation itself).
// Order matters: the first matching topic wins, so specific topics come
// before broad ones (check-in/out last).
const TOPICS: Topic[] = [
  { triggers: /짐|luggage|baggage|荷物|行李/i, query: { ko: "짐 보관", ja: "荷物" } },
  { triggers: /와이파이|wi-?fi|ワイファイ|无线|無線/i, query: { ko: "와이파이", ja: "Wi-Fi" } },
  {
    triggers: /조식|아침 ?식사|breakfast|朝食|朝ごはん|早餐|早饭|早飯/i,
    query: { ko: "조식", ja: "朝食" },
  },
  {
    triggers: /알레르기|채식|allerg|vegetarian|vegan|アレルギー|ベジタリアン|过敏|過敏|素食/i,
    query: { ko: "알레르기", ja: "アレルギー" },
  },
  {
    triggers: /저녁 ?식사|석식|dinner|夕食|晚餐|晚饭|晚飯/i,
    query: { ko: "저녁 식사", ja: "夕食" },
  },
  { triggers: /주차|parking|駐車|停车|停車/i, query: { ko: "주차", ja: "駐車場" } },
  {
    triggers: /흡연|담배|smok|喫煙|たばこ|タバコ|吸烟|抽烟|吸菸|抽菸/i,
    query: { ko: "흡연", ja: "喫煙" },
  },
  {
    triggers: /반려|강아지|애완|\bpets?\b|\bdogs?\b|ペット|宠物|寵物/i,
    query: { ko: "반려동물", ja: "ペット" },
  },
  { triggers: /세탁|빨래|laundry|洗濯|洗衣/i, query: { ko: "세탁", ja: "洗濯" } },
  { triggers: /공항|airport|空港|机场|機場/i, query: { ko: "공항", ja: "空港" } },
  {
    triggers: /지하철|역에서|가까운 역|station|subway|地下鉄|駅|地铁|地鐵|车站|車站/i,
    query: { ko: "지하철역", ja: "駅" },
  },
  {
    triggers: /문신|타투|tattoo|タトゥー|入れ墨|刺青|纹身|紋身/i,
    query: { ko: "문신", ja: "タトゥー" },
  },
  {
    triggers: /온천|대욕장|목욕|onsen|hot spring|\bbath\b|温泉|大浴場|お風呂|浴场|浴場/i,
    query: { ko: "대욕장", ja: "大浴場" },
  },
  {
    triggers: /소음|조용|quiet|noise|curfew|門限|静か|静粛|安静/i,
    query: { ko: "조용한 시간", ja: "静粛時間" },
  },
  {
    triggers:
      /취소 ?(정책|규정|수수료)|cancellation policy|キャンセル(ポリシー|料)|取消政策|取消費|取消费/i,
    query: { ko: "취소 환불 정책", ja: "キャンセル" },
  },
  {
    triggers: /결제|지불|카드 ?결제|\bpay(ment)?\b|支払|支付|付款/i,
    query: { ko: "결제", ja: "支払い" },
  },
  { triggers: /주방|부엌|kitchen|キッチン|厨房|廚房/i, query: { ko: "주방", ja: "キッチン" } },
  {
    triggers: /수건|어메니티|샴푸|towel|amenit|shampoo|タオル|アメニティ|浴衣|毛巾/i,
    query: { ko: "수건 어메니티", ja: "アメニティ" },
  },
  {
    triggers: /맛집|식당|먹을|restaurant|food|eat|グルメ|レストラン|屋台|美食|餐厅|餐廳/i,
    query: { ko: "맛집", ja: "屋台" },
  },
  {
    triggers: /편의점|convenience|コンビニ|便利店|便利商店|超商/i,
    query: { ko: "편의점", ja: "コンビニ" },
  },
  {
    triggers: /약국|pharmacy|drugstore|ドラッグストア|薬局|药店|藥局/i,
    query: { ko: "약국", ja: "ドラッグストア" },
  },
  {
    triggers: /아이|어린이|유아|child|kid|baby|子供|子ども|お子様|儿童|兒童|小孩/i,
    query: { ko: "어린이", ja: "お子様" },
  },
  {
    triggers: /관광|명소|sightseeing|attraction|観光|太宰府|景点|景點/i,
    query: { ko: "관광지", ja: "太宰府" },
  },
  {
    triggers: /체크인|check[- ]?in|チェックイン|入住/i,
    query: { ko: "체크인", ja: "チェックイン" },
  },
  {
    triggers: /체크아웃|check[- ]?out|チェックアウト|退房/i,
    query: { ko: "체크아웃", ja: "チェックアウト" },
  },
];

const INJECTION =
  /ignore (all |the )?(previous|prior|above)|system prompt|developer mode|admin(istrator)? mode|you are now|jailbreak|이전 지시|지시를 무시|시스템 프롬프트|관리자 모드|개발자 모드|以前の指示|指示を無視|システムプロンプト|管理者モード|忽略(之前|以上|所有)|系统提示|系統提示|管理员模式|管理員模式/i;
const HUMAN =
  /사람이랑|사람과|직원|담당자|상담원|real person|human|staff member|speak to (someone|a person)|talk to (someone|a person)|スタッフ|担当者|人と話|人工客服|真人|客服|工作人员|工作人員/i;
const REFUND = /환불|보상|refund|compensat|money back|返金|返還|補償|退款|退钱|退錢|赔偿|賠償/i;
const COMPLAINT =
  /불만|최악|더러|시끄러|불친절|벌레|dirty|noisy|complain|terrible|awful|bugs?\b|rude|汚い|うるさ|眠れ|クレーム|最悪|虫が|脏|吵|投诉|投訴|太差/i;
const BOOKING =
  /예약|방 있|빈 ?방|book(ing)?|reserv|vacanc|availab|予約|空室|空き部屋|预订|預訂|预约|預約|有空房/i;

const DECLINE: Record<GuestLanguage, string> = {
  ko: "죄송하지만 그 요청은 도와드릴 수 없습니다. 숙박과 관련해 궁금한 점이 있으시면 말씀해 주세요.",
  ja: "申し訳ございませんが、そのご依頼にはお応えできません。ご滞在に関するご質問があればお知らせください。",
  en: "Sorry, I can't help with that request. If you have any questions about your stay, just let me know.",
  "zh-CN": "抱歉，这个请求我无法协助。如有住宿相关问题，请告诉我。",
  "zh-TW": "抱歉，這個請求我無法協助。如有住宿相關問題，請告訴我。",
};

const FOLLOW_UP: Record<GuestLanguage, string> = {
  ko: "확인 후 안내드리겠습니다. 담당자가 곧 답변드리겠습니다.",
  ja: "確認のうえご案内いたします。まもなく担当者よりご返信いたします。",
  en: "Let me check and get back to you. A staff member will reply shortly.",
  "zh-CN": "我们确认后再为您说明，工作人员会尽快回复您。",
  "zh-TW": "我們確認後再為您說明，工作人員會盡快回覆您。",
};

const MIN_ANSWER_SCORE = 0.3;

function systemText(request: AgentTurnRequest): string {
  return request.system.map((b) => b.text).join("\n");
}

function readGuestLanguage(system: string): GuestLanguage {
  const code = system.match(/guest_language: [^(]*\(([^)]+)\)/)?.[1];
  return isGuestLanguage(code) ? code : "en";
}

function readKnowledgeLanguage(system: string): "ko" | "ja" {
  return system.match(/knowledge_language: [^(]*\(([^)]+)\)/)?.[1] === "ja" ? "ja" : "ko";
}

function lastGuestText(messages: AgentMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    const text = m.content.find((b) => b.type === "text");
    if (text && text.type === "text") return text.text;
  }
  return "";
}

type ToolResult = { name: string; output: unknown };

/** Tool results of the current turn (after the last guest text message). */
function currentToolResults(messages: AgentMessage[]): ToolResult[] {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user" || typeof last.content === "string") return [];
  const previous = messages[messages.length - 2];
  const names = new Map<string, string>();
  if (previous?.role === "assistant" && typeof previous.content !== "string") {
    for (const block of previous.content) {
      if (block.type === "tool_use") names.set(block.id, block.name);
    }
  }
  return last.content
    .filter((b) => b.type === "tool_result")
    .map((b) => {
      const content = b.type === "tool_result" ? b.content : undefined;
      const raw = typeof content === "string" ? content : "";
      let output: unknown = raw;
      try {
        output = JSON.parse(raw);
      } catch {
        // keep raw string
      }
      return { name: names.get(b.type === "tool_result" ? b.tool_use_id : "") ?? "", output };
    });
}

let idCounter = 0;
function toolUse(name: string, input: Record<string, unknown>): AgentContentBlock {
  idCounter += 1;
  return { type: "tool_use", id: `toolu_mock_${idCounter}`, name, input } as AgentContentBlock;
}

function text(value: string): AgentContentBlock {
  return { type: "text", text: value, citations: null } as AgentContentBlock;
}

function respond(
  content: AgentContentBlock[],
  stopReason: "tool_use" | "end_turn",
): AgentTurnResponse {
  const outputTokens = JSON.stringify(content).length / 4;
  return {
    model: "mock",
    content,
    stopReason,
    usage: { ...ZERO_USAGE, inputTokens: 0, outputTokens: Math.ceil(outputTokens) },
  };
}

export class MockLlmClient implements LlmClient {
  readonly mode = "mock" as const;
  readonly mainModel = "mock";
  readonly fastModel = "mock";

  async agentTurn(request: AgentTurnRequest): Promise<AgentTurnResponse> {
    const system = systemText(request);
    const lang = readGuestLanguage(system);
    const kbLang = readKnowledgeLanguage(system);
    const results = currentToolResults(request.messages);

    // Second step: react to tool results.
    if (results.length) {
      const escalated = results.find((r) => r.name === "escalate_to_human");
      if (escalated) return respond([text(FOLLOW_UP[lang])], "end_turn");

      const search = results.find((r) => r.name === "search_knowledge");
      const items = (search?.output as { items?: { id: string; content: string; score: number }[] })
        ?.items;
      const best = items?.[0];
      if (best && best.score >= MIN_ANSWER_SCORE) {
        const prefix = lang === kbLang ? "" : `[mock ${kbLang}→${lang}] `;
        return respond(
          [text(`${prefix}${best.content}\n<sources>${best.id}</sources>`)],
          "end_turn",
        );
      }
      return respond(
        [
          toolUse("escalate_to_human", {
            reason: "UNKNOWN_ANSWER",
            summary: "[mock] No matching knowledge item for the guest's question.",
          }),
        ],
        "tool_use",
      );
    }

    // First step: classify the guest message.
    const guest = lastGuestText(request.messages);
    if (INJECTION.test(guest)) return respond([text(DECLINE[lang])], "end_turn");

    const escalateFor = (reason: string, summary: string) =>
      respond([toolUse("escalate_to_human", { reason, summary: `[mock] ${summary}` })], "tool_use");

    if (HUMAN.test(guest)) return escalateFor("GUEST_REQUESTED_HUMAN", "Guest asked for a person.");
    if (REFUND.test(guest))
      return escalateFor("REFUND", "Guest asked about a refund or compensation.");
    if (COMPLAINT.test(guest)) return escalateFor("COMPLAINT", "Guest complained about the stay.");
    if (BOOKING.test(guest)) return escalateFor("BOOKING_CHANGE", "Guest asked about a booking.");

    const topic = TOPICS.find((t) => t.triggers.test(guest));
    const query = topic ? topic.query[kbLang] : guest.slice(0, 200);
    return respond([toolUse("search_knowledge", { query })], "tool_use");
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    return { model: "mock", text: request.prompt, usage: ZERO_USAGE };
  }
}
