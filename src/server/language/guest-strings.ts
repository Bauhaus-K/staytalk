import type { Country } from "@/generated/prisma/enums";
import type { GuestLanguage } from "./codes";

/**
 * Fixed guest-facing messages sent without the LLM (deterministic, so they
 * work in mock mode, on LLM failure, and when the usage cap is reached).
 */
type Strings = {
  escalationNotice: string;
  checkingAnswer: string;
  piiWarning: string;
  emergency: (country: Country) => string;
};

const emergencyNumbers = (country: Country) =>
  country === "JP" ? { police: "110", fire: "119" } : { police: "112", fire: "119" };

export const GUEST_STRINGS: Record<GuestLanguage, Strings> = {
  ko: {
    escalationNotice: "담당자에게 전달했습니다. 담당자가 곧 답변드리겠습니다.",
    checkingAnswer: "확인 후 안내드리겠습니다. 담당자가 곧 답변드리겠습니다.",
    piiWarning:
      "보안을 위해 카드번호나 여권번호는 채팅으로 보내지 마세요. 입력하신 번호는 저장하지 않았습니다.",
    emergency: (c) => {
      const n = emergencyNumbers(c);
      return `긴급 상황이라면 지금 바로 ${n.fire}(화재·구급) 또는 ${n.police}(경찰)에 전화하세요. 숙소 담당자에게도 즉시 알렸습니다.`;
    },
  },
  ja: {
    escalationNotice: "担当者に引き継ぎました。まもなく担当者よりご返信いたします。",
    checkingAnswer: "確認のうえご案内いたします。まもなく担当者よりご返信いたします。",
    piiWarning:
      "セキュリティのため、カード番号やパスポート番号はチャットで送信しないでください。入力された番号は保存しておりません。",
    emergency: (c) => {
      const n = emergencyNumbers(c);
      return `緊急の場合は、今すぐ${n.fire}（火事・救急）または${n.police}（警察）に電話してください。施設の担当者にもすぐに知らせました。`;
    },
  },
  en: {
    escalationNotice: "I've passed this to our staff. A staff member will reply shortly.",
    checkingAnswer: "Let me check and get back to you. A staff member will reply shortly.",
    piiWarning:
      "For your security, please don't send card or passport numbers in chat. We did not store the number you entered.",
    emergency: (c) => {
      const n = emergencyNumbers(c);
      return `If this is an emergency, call ${n.fire} (fire/ambulance) or ${n.police} (police) right now. We have also alerted the property staff immediately.`;
    },
  },
  "zh-CN": {
    escalationNotice: "已转交给工作人员，工作人员会尽快回复您。",
    checkingAnswer: "我们确认后再为您说明，工作人员会尽快回复您。",
    piiWarning: "为了您的安全，请不要在聊天中发送银行卡号或护照号码。您输入的号码未被保存。",
    emergency: (c) => {
      const n = emergencyNumbers(c);
      return `如遇紧急情况，请立即拨打 ${n.fire}（火警·急救）或 ${n.police}（报警）。我们也已立即通知住宿工作人员。`;
    },
  },
  "zh-TW": {
    escalationNotice: "已轉交給工作人員，工作人員會盡快回覆您。",
    checkingAnswer: "我們確認後再為您說明，工作人員會盡快回覆您。",
    piiWarning: "為了您的安全，請不要在聊天中傳送信用卡號或護照號碼。您輸入的號碼未被儲存。",
    emergency: (c) => {
      const n = emergencyNumbers(c);
      return `如遇緊急情況，請立即撥打 ${n.fire}（火警・救護）或 ${n.police}（報警）。我們也已立即通知住宿工作人員。`;
    },
  },
};
