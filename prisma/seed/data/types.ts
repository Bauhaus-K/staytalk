import type { KnowledgeCategory, PricingModel, Country } from "../../../src/generated/prisma/enums";

export type LocalizedText = Partial<Record<"ko" | "ja" | "en" | "zh-CN" | "zh-TW", string>>;

export type SeedUser = { email: string; name: string; locale: "ko" | "ja" | "en" };

export type SeedProperty = {
  organization: { id: string; name: string };
  owner: SeedUser;
  staff: SeedUser[];
  property: {
    name: string;
    country: Country;
    address: string;
    timezone: string;
    defaultLanguage: string;
    staffLanguage: string;
    currency: string;
    checkInTime: string;
    checkOutTime: string;
    phone: string;
    widgetPublicKey: string;
    allowedOrigins: string[];
    monthlyTokenLimit: number;
  };
  roomTypes: {
    key: string;
    name: LocalizedText;
    description: LocalizedText;
    capacity: number;
    pricingModel: PricingModel;
    baseRate: number;
    totalRooms: number;
  }[];
  knowledge: { category: KnowledgeCategory; question: string; content: string }[];
};
