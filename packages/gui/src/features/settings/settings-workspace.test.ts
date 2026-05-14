import { describe, expect, test } from "bun:test"
import { normalizeGuiSettings, type GuiMcpServer } from "./settings-workspace"

function playwrightServer(timeout: number): GuiMcpServer {
  return {
    id: "mcp-browser-playwright-default",
    name: "playwright",
    type: "local",
    enabled: true,
    command: "npx",
    args: "-y\n@playwright/mcp\n--headless",
    url: "",
    env: "",
    headers: "",
    timeout,
    cwd: "",
  }
}

describe("browser MCP settings", () => {
  test("migrates the default Playwright MCP timeout", () => {
    const settings = normalizeGuiSettings({
      browserUse: true,
      mcpEnabled: true,
      browserHeadless: true,
      browserMcpSettingsVersion: 1,
      mcpServerList: [playwrightServer(30_000)],
    })

    expect(settings.browserMcpSettingsVersion).toBe(2)
    expect(settings.mcpServerList[0]?.timeout).toBe(60_000)
  })

  test("preserves custom Playwright MCP timeouts", () => {
    const settings = normalizeGuiSettings({
      browserUse: true,
      mcpEnabled: true,
      browserHeadless: true,
      browserMcpSettingsVersion: 1,
      mcpServerList: [playwrightServer(120_000)],
    })

    expect(settings.mcpServerList[0]?.timeout).toBe(120_000)
  })
})
