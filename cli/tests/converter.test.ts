import { describe, expect, it } from "vitest";
import { ConversionError, convertCaptureValue } from "../src/converter.js";

describe("convertCaptureValue", () => {
  it("默认按字符串原样返回", () => {
    expect(convertCaptureValue("title", "hello", undefined)).toBe("hello");
    expect(convertCaptureValue("title", "hello", { type: "string" })).toBe("hello");
  });

  it("integer 转换成功", () => {
    expect(convertCaptureValue("n", "42", { type: "integer" })).toBe(42);
  });

  it("integer 前导零会被丢弃", () => {
    expect(convertCaptureValue("n", "007", { type: "integer" })).toBe(7);
  });

  it("integer 非法值报错", () => {
    expect(() => convertCaptureValue("n", "abc", { type: "integer" })).toThrow(ConversionError);
  });

  it("number 转换 float", () => {
    expect(convertCaptureValue("v", "3.14", { type: "number" })).toBe(3.14);
  });

  it("integer 拒绝小数", () => {
    expect(() => convertCaptureValue("v", "3.14", { type: "integer" })).toThrow(ConversionError);
  });

  it("boolean 转换", () => {
    expect(convertCaptureValue("b", "true", { type: "boolean" })).toBe(true);
    expect(convertCaptureValue("b", "false", { type: "boolean" })).toBe(false);
  });

  it("boolean 非法值报错", () => {
    expect(() => convertCaptureValue("b", "yes", { type: "boolean" })).toThrow(ConversionError);
  });

  it("YYYYMMDD 归一化为 YYYY-MM-DD", () => {
    expect(
      convertCaptureValue("d", "20260415", { type: "string", format: "date" }),
    ).toBe("2026-04-15");
  });

  it("YYYY-MM-DD 原样保留", () => {
    expect(
      convertCaptureValue("d", "2026-04-15", { type: "string", format: "date" }),
    ).toBe("2026-04-15");
  });

  it("非日期字符串报错", () => {
    expect(() =>
      convertCaptureValue("d", "April 15", { type: "string", format: "date" }),
    ).toThrow(ConversionError);
  });

  it("array / object / null 类型的捕获组报配置错误", () => {
    expect(() => convertCaptureValue("a", "x", { type: "array" })).toThrow(ConversionError);
    expect(() => convertCaptureValue("a", "x", { type: "object" })).toThrow(ConversionError);
    expect(() => convertCaptureValue("a", "x", { type: "null" })).toThrow(ConversionError);
  });
});
