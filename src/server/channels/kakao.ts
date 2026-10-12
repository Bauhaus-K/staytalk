import type { ChannelAdapter } from "./types";

/**
 * Kakao Talk channel — stub. Kakao's chatbot (i 오픈빌더) skill server and
 * the consultation-talk API need a business partnership; this keeps the
 * shape so it can be implemented against ChannelAdapter later.
 *
 * TODO(kakao): verify skill-server requests, parse `userRequest.utterance`
 *   and `userRequest.user.id`, respond with a SimpleText skill response, and
 *   push via the consultation API.
 */
export class KakaoAdapter implements ChannelAdapter {
  readonly channel = "KAKAO" as const;

  async verifySignature(): Promise<boolean> {
    return false;
  }

  async receive(): Promise<never[]> {
    throw new Error("Kakao channel is not implemented yet");
  }

  async send(): Promise<void> {
    throw new Error("Kakao channel is not implemented yet");
  }
}
