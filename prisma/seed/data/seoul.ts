import type { SeedProperty } from "./types";

// Fictional sample property. Any resemblance to a real business is coincidental.
export const seoulGuesthouse: SeedProperty = {
  organization: { id: "org_demo_seoul", name: "서촌스테이 주식회사" },
  owner: {
    email: "owner@seoul.example",
    name: "김민지",
    locale: "ko",
  },
  staff: [{ email: "staff@seoul.example", name: "박준호", locale: "ko" }],
  property: {
    name: "서촌 한옥 게스트하우스",
    country: "KR",
    address: "서울특별시 종로구 자하문로 00길 12 (샘플 주소)",
    timezone: "Asia/Seoul",
    defaultLanguage: "ko",
    staffLanguage: "ko",
    currency: "KRW",
    checkInTime: "15:00",
    checkOutTime: "11:00",
    phone: "+82-2-0000-0000",
    widgetPublicKey: "pk_demo_seoul",
    allowedOrigins: ["http://localhost:3000", "http://localhost:4173"],
    monthlyTokenLimit: 2_000_000,
  },
  roomTypes: [
    {
      key: "dorm",
      name: { ko: "4인 여성 도미토리", ja: "女性専用4人ドミトリー", en: "4-Bed Female Dormitory" },
      description: {
        ko: "2층 침대 2개, 개인 사물함, 공용 욕실",
        ja: "2段ベッド2台、個人ロッカー、共用バスルーム",
        en: "Two bunk beds, private lockers, shared bathroom",
      },
      capacity: 1,
      pricingModel: "PER_PERSON",
      baseRate: 35_000,
      totalRooms: 4,
    },
    {
      key: "double",
      name: { ko: "한옥 더블룸", ja: "韓屋ダブルルーム", en: "Hanok Double Room" },
      description: {
        ko: "온돌 바닥, 더블 침대, 전용 욕실",
        ja: "オンドル床、ダブルベッド、専用バスルーム",
        en: "Ondol heated floor, double bed, private bathroom",
      },
      capacity: 2,
      pricingModel: "PER_ROOM",
      baseRate: 98_000,
      totalRooms: 3,
    },
    {
      key: "family",
      name: { ko: "패밀리룸", ja: "ファミリールーム", en: "Family Room" },
      description: {
        ko: "더블 침대 1개 + 요 2채, 전용 욕실, 마당 전망",
        ja: "ダブルベッド1台＋布団2組、専用バスルーム、中庭ビュー",
        en: "One double bed plus two floor mattresses, private bathroom, courtyard view",
      },
      capacity: 4,
      pricingModel: "PER_ROOM",
      baseRate: 160_000,
      totalRooms: 1,
    },
  ],
  knowledge: [
    {
      category: "CHECKIN",
      question: "체크인·체크아웃 시간",
      content:
        "체크인은 15:00부터 22:00까지, 체크아웃은 11:00까지입니다. 얼리 체크인은 객실 준비 상황에 따라 가능하며 당일 문의해 주세요. 레이트 체크아웃(최대 13:00)은 1시간당 10,000원입니다.",
    },
    {
      category: "CHECKIN",
      question: "셀프 체크인 방법",
      content:
        "22:00 이후 도착하시면 셀프 체크인입니다. 대문 도어락 비밀번호와 객실 번호는 체크인 당일 오전 10시에 예약 시 등록한 연락처로 문자 또는 메신저로 보내드립니다. 비밀번호를 받지 못하셨다면 프런트로 연락해 주세요.",
    },
    {
      category: "CHECKIN",
      question: "짐 보관",
      content:
        "체크인 전과 체크아웃 후 당일 18:00까지 리셉션 옆 짐 보관실에 무료로 짐을 맡기실 수 있습니다. 귀중품은 보관하지 않습니다.",
    },
    {
      category: "HOUSE_RULES",
      question: "조용한 시간(소음)",
      content:
        "한옥 주택가에 위치해 22:00부터 08:00까지는 조용한 시간입니다. 마당과 공용 공간에서 큰 소리로 대화하거나 음악을 트는 것은 삼가 주세요.",
    },
    {
      category: "HOUSE_RULES",
      question: "흡연",
      content:
        "건물 전체와 마당은 금연입니다(전자담배 포함). 흡연은 대문 밖 골목 끝 지정 흡연 구역을 이용해 주세요. 실내 흡연 시 청소비 200,000원이 부과됩니다.",
    },
    {
      category: "HOUSE_RULES",
      question: "반려동물",
      content: "죄송하지만 반려동물은 동반하실 수 없습니다. 단, 시각장애인 안내견은 예외입니다.",
    },
    {
      category: "FACILITY",
      question: "와이파이",
      content:
        "전 객실과 공용 공간에서 무료 와이파이를 이용하실 수 있습니다. 네트워크 이름과 비밀번호는 객실 안내문과 리셉션에 게시되어 있습니다.",
    },
    {
      category: "FACILITY",
      question: "조식",
      content:
        "08:00~10:00 공용 라운지에서 간단한 조식(토스트, 시리얼, 과일, 커피·차)을 무료로 제공합니다. 한식 조식은 제공하지 않습니다.",
    },
    {
      category: "FACILITY",
      question: "공용 주방",
      content:
        "공용 주방은 07:00~22:00에 이용 가능합니다. 전자레인지, 냉장고, 인덕션, 기본 식기가 있습니다. 사용 후 설거지와 정리를 부탁드립니다.",
    },
    {
      category: "FACILITY",
      question: "세탁",
      content:
        "지하 세탁실에 코인 세탁기(1회 4,000원)와 건조기(1회 4,000원)가 있습니다. 세제는 무료로 제공합니다.",
    },
    {
      category: "FACILITY",
      question: "수건과 어메니티",
      content:
        "수건, 샴푸, 컨디셔너, 바디워시, 헤어드라이어가 제공됩니다. 칫솔과 면도기는 리셉션에서 1,000원에 판매합니다. 수건 교체는 리셉션에 요청해 주세요.",
    },
    {
      category: "FACILITY",
      question: "주차",
      content:
        "숙소에는 주차 공간이 없습니다. 도보 5분 거리의 공영 주차장(유료)을 이용해 주세요. 대중교통 이용을 권장합니다.",
    },
    {
      category: "TRANSPORT",
      question: "인천공항에서 오는 방법",
      content:
        "인천공항에서 공항철도(AREX)를 타고 서울역에서 내린 뒤, 지하철 1호선 또는 4호선을 이용해 종로3가역(또는 충무로역)에서 3호선으로 환승하여 경복궁역에서 내리세요. 경복궁역 3번 출구에서 도보 7분입니다. 총 약 75~90분 소요됩니다.",
    },
    {
      category: "TRANSPORT",
      question: "김포공항에서 오는 방법",
      content:
        "김포공항에서 지하철 5호선을 타고 광화문역에서 내려 도보 15분, 또는 택시로 약 10분입니다. 총 약 50분 소요됩니다.",
    },
    {
      category: "TRANSPORT",
      question: "가장 가까운 지하철역",
      content: "지하철 3호선 경복궁역 3번 출구에서 도보 7분입니다.",
    },
    {
      category: "NEARBY",
      question: "근처 맛집과 시장",
      content:
        "도보 5분 거리의 통인시장에서는 엽전 도시락(기름떡볶이 등)을 즐길 수 있습니다(월요일 일부 점포 휴무). 서촌 골목에는 칼국수, 삼계탕, 카페가 많습니다. 리셉션에 지도가 있습니다.",
    },
    {
      category: "NEARBY",
      question: "주변 관광지",
      content:
        "경복궁(도보 10분), 국립고궁박물관, 인왕산 성곽길(입구까지 도보 15분), 북촌한옥마을(버스 또는 도보 25분)이 가깝습니다. 경복궁은 화요일 휴궁입니다.",
    },
    {
      category: "NEARBY",
      question: "편의점과 약국",
      content:
        "대문에서 도보 2분 거리에 24시간 편의점이 있고, 도보 4분 거리에 약국이 있습니다(일요일 휴무).",
    },
    {
      category: "POLICY",
      question: "취소 및 환불 정책",
      content:
        "체크인 7일 전까지 취소 시 전액 환불, 3~6일 전 50% 환불, 2일 전부터는 환불이 불가합니다. 예약 플랫폼을 통해 예약하신 경우 해당 플랫폼의 정책이 우선합니다. 환불 처리는 담당자가 직접 확인 후 안내드립니다.",
    },
    {
      category: "FAQ",
      question: "결제 방법",
      content:
        "현장 결제 시 신용카드(VISA, Master, JCB, UnionPay)와 현금(원화)을 받습니다. 숙박 요금은 예약 확정 시 숙소에서 별도로 안내드립니다.",
    },
  ],
};
