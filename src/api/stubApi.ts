import type { HomeApi } from "./HomeApi";

// Minimal stand-in until feature 110 provides the full mock house. Always online, no entities.
export const stubApi: HomeApi = {
  async getStatus() {
    return { online: true, message: "stub", version: "stub" };
  },
  async getAreas() {
    return [];
  },
  async getEntities() {
    return [];
  },
  async runAction() {
    throw new Error("Stub API cannot run actions");
  },
  subscribe() {
    return () => {};
  },
  async getHistory() {
    return [];
  },
};
