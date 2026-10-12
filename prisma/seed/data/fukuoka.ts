import type { SeedProperty } from "./types";

// Fictional sample property. Any resemblance to a real business is coincidental.
export const fukuokaRyokan: SeedProperty = {
  organization: { id: "org_demo_fukuoka", name: "株式会社ゆらり" },
  owner: {
    email: "owner@fukuoka.example",
    name: "中村 美咲",
    locale: "ja",
  },
  staff: [],
  property: {
    name: "博多 ゆらり庵",
    country: "JP",
    address: "福岡県福岡市博多区〇〇町1-2-3（サンプル住所）",
    timezone: "Asia/Tokyo",
    defaultLanguage: "ja",
    staffLanguage: "ja",
    currency: "JPY",
    checkInTime: "15:00",
    checkOutTime: "10:00",
    phone: "+81-92-000-0000",
    widgetPublicKey: "pk_demo_fukuoka",
    allowedOrigins: ["http://localhost:3000", "http://localhost:4173"],
    monthlyTokenLimit: 2_000_000,
  },
  roomTypes: [
    {
      key: "washitsu6",
      name: { ja: "和室6畳", ko: "다다미 6조 객실", en: "Japanese Room (6 tatami)" },
      description: {
        ja: "1泊2食付き、布団、共用大浴場利用",
        ko: "1박 2식 포함, 이불, 공용 대욕장 이용",
        en: "Dinner and breakfast included, futon bedding, shared bath",
      },
      capacity: 2,
      pricingModel: "PER_PERSON",
      baseRate: 18_000,
      totalRooms: 4,
    },
    {
      key: "washitsu10",
      name: { ja: "和室10畳", ko: "다다미 10조 객실", en: "Japanese Room (10 tatami)" },
      description: {
        ja: "1泊2食付き、最大4名、坪庭付き",
        ko: "1박 2식 포함, 최대 4명, 작은 정원",
        en: "Dinner and breakfast included, up to 4 guests, small garden",
      },
      capacity: 4,
      pricingModel: "PER_PERSON",
      baseRate: 16_000,
      totalRooms: 3,
    },
    {
      key: "rotenburo",
      name: {
        ja: "露天風呂付き客室",
        ko: "노천탕 딸린 객실",
        en: "Room with Private Open-air Bath",
      },
      description: {
        ja: "1泊2食付き、客室専用露天風呂",
        ko: "1박 2식 포함, 객실 전용 노천탕",
        en: "Dinner and breakfast included, private open-air bath",
      },
      capacity: 2,
      pricingModel: "PER_PERSON",
      baseRate: 32_000,
      totalRooms: 2,
    },
  ],
  knowledge: [
    {
      category: "CHECKIN",
      question: "チェックイン・チェックアウト時間",
      content:
        "チェックインは15:00〜20:00、チェックアウトは10:00です。ご夕食の準備の都合上、18:00以降のご到着の場合は事前にご連絡ください。20:00以降のチェックインはお受けできません。",
    },
    {
      category: "CHECKIN",
      question: "荷物の預かり",
      content:
        "チェックイン前およびチェックアウト後も、当日17:00までフロントでお荷物を無料でお預かりします。",
    },
    {
      category: "FACILITY",
      question: "大浴場（温泉）の利用時間",
      content:
        "大浴場は15:00〜24:00、翌朝6:00〜9:30にご利用いただけます。男女入れ替え制で、21:00に入れ替わります。タオルはお部屋からお持ちください。",
    },
    {
      category: "HOUSE_RULES",
      question: "タトゥー（入れ墨）",
      content:
        "大浴場はタトゥーのある方のご利用をお断りしております。貸切風呂（1回45分、予約制・無料）または露天風呂付き客室をご利用いただけます。",
    },
    {
      category: "FACILITY",
      question: "貸切風呂",
      content:
        "貸切風呂は16:00〜22:00の間、1回45分でご利用いただけます。予約制・無料です。チェックイン時にフロントでご予約ください。",
    },
    {
      category: "FACILITY",
      question: "夕食・朝食の時間",
      content:
        "ご夕食は18:00または19:30からの二部制で、お食事処にて九州の食材を使った会席料理をご提供します。ご朝食は7:30〜9:00の間にお越しください。",
    },
    {
      category: "FAQ",
      question: "食物アレルギー・食事制限",
      content:
        "食物アレルギーやベジタリアン等のご希望は、ご到着の3日前までにお知らせください。可能な範囲で対応いたします。当日のご変更はお受けできない場合があります。",
    },
    {
      category: "FACILITY",
      question: "浴衣・アメニティ",
      content:
        "浴衣、タオル、歯ブラシ、シャンプー、コンディショナー、ボディソープ、ドライヤーをご用意しております。浴衣のまま館内およびお食事処をご利用いただけます。",
    },
    {
      category: "FACILITY",
      question: "Wi-Fi",
      content:
        "全館で無料Wi-Fiをご利用いただけます。ネットワーク名とパスワードはお部屋の案内書に記載しております。",
    },
    {
      category: "FACILITY",
      question: "駐車場",
      content:
        "敷地内に2台分の駐車場があります（1泊1,000円、予約制）。満車の場合は近隣のコインパーキングをご案内します。",
    },
    {
      category: "HOUSE_RULES",
      question: "喫煙",
      content: "館内は全室禁煙です。喫煙は玄関横の喫煙所をご利用ください。",
    },
    {
      category: "HOUSE_RULES",
      question: "静粛時間・門限",
      content:
        "22:00以降はお静かにお過ごしください。玄関は23:00に施錠します。それ以降に外出・帰館される場合は、フロントで夜間用の暗証番号をお尋ねください。",
    },
    {
      category: "FAQ",
      question: "お子様連れ",
      content:
        "お子様連れも歓迎です。添い寝（未就学児・食事なし）は無料です。お子様用の浴衣とお食事のご用意も可能です。ご予約時にお子様の年齢をお知らせください。",
    },
    {
      category: "TRANSPORT",
      question: "福岡空港からのアクセス",
      content:
        "福岡空港国内線ターミナルから地下鉄空港線で博多駅まで約5分、博多駅筑紫口から徒歩12分またはタクシーで約5分です。国際線ターミナルからは連絡バスで国内線ターミナルへ移動してください（約15分）。",
    },
    {
      category: "TRANSPORT",
      question: "博多港（釜山からのフェリー）からのアクセス",
      content:
        "博多港国際ターミナルからタクシーで約15分、または西鉄バスで博多駅まで約20分、そこから徒歩12分です。",
    },
    {
      category: "NEARBY",
      question: "中洲の屋台",
      content:
        "中洲の屋台街まではタクシーで約10分、徒歩で約25分です。屋台は18:00頃から営業し、天候により休業する場合があります。現金のみの屋台が多いのでご注意ください。",
    },
    {
      category: "NEARBY",
      question: "太宰府天満宮への行き方",
      content:
        "博多駅から西鉄バス「旅人」で太宰府まで約40分です。または西鉄天神大牟田線で天神から二日市乗り換え、太宰府駅まで約30分です。",
    },
    {
      category: "NEARBY",
      question: "近くのコンビニ・ドラッグストア",
      content:
        "徒歩3分の場所に24時間営業のコンビニ、徒歩6分の場所にドラッグストア（22:00閉店）があります。",
    },
    {
      category: "POLICY",
      question: "キャンセルポリシー",
      content:
        "キャンセル料は、宿泊日の7日前から3日前まで宿泊料金の20%、前日50%、当日および無連絡不泊は100%となります。予約サイト経由のご予約は各サイトの規定が優先されます。返金に関するご相談は担当者が個別に対応いたします。",
    },
    {
      category: "FAQ",
      question: "お支払い方法",
      content:
        "チェックアウト時に現金（日本円）、クレジットカード（VISA、Master、JCB、AMEX）、交通系ICカードでお支払いいただけます。入湯税（大人1名1泊150円）が別途かかります。",
    },
  ],
};
