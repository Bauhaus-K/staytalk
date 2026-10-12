import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import en from "./messages/en.json";
import ja from "./messages/ja.json";
import ko from "./messages/ko.json";

type Tree = { [key: string]: string | Tree };

function keys(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === "string" ? [`${prefix}${k}`] : keys(v, `${prefix}${k}.`),
  );
}

describe("i18n messages", () => {
  const all = { ko, ja, en } as Record<string, Tree>;

  it("ja and en define exactly the keys of ko", () => {
    const reference = keys(all.ko!).sort();
    expect(keys(all.ja!).sort()).toEqual(reference);
    expect(keys(all.en!).sort()).toEqual(reference);
  });

  it("every message is valid ICU syntax (e.g. no unescaped <tags>)", () => {
    for (const locale of ["ko", "ja", "en"] as const) {
      const messages = all[locale]!;
      const errors: string[] = [];
      const t = createTranslator({
        locale,
        messages,
        // Missing-variable errors are expected here (no values passed); only
        // syntax errors (INVALID_MESSAGE) mean a broken message.
        onError: (e) => {
          if (!e.message.startsWith("FORMATTING_ERROR")) errors.push(`${locale}: ${e.message}`);
        },
        getMessageFallback: ({ key }) => key,
      }) as unknown as (key: string, values?: Record<string, unknown>) => string;
      for (const key of keys(messages)) t(key);
      expect(errors).toEqual([]);
    }
  });
});
