import { describe, expect, test } from "bun:test"
import { filterVisibleSidebarSessions, isTopLevelSession, isVisibleSidebarSession } from "./session-visibility"

describe("session visibility", () => {
  test("keeps only active top-level sessions for the sidebar", () => {
    const sessions = [
      { id: "parent", title: "Parent", parentId: null, archivedAt: null },
      { id: "child", title: "Child", parentId: "parent", archivedAt: null },
      { id: "archived", title: "Archived", archivedAt: 123 },
    ]

    expect(filterVisibleSidebarSessions(sessions).map((session) => session.id)).toEqual(["parent"])
  })

  test("treats missing and empty parent ids as top-level sessions", () => {
    expect(isTopLevelSession({})).toBe(true)
    expect(isTopLevelSession({ parentId: "" })).toBe(true)
    expect(isVisibleSidebarSession({ parentId: "", archivedAt: null })).toBe(true)
  })

  test("returns an empty list when fetched data only contains child sessions", () => {
    const sessions = [
      { id: "child-1", parentId: "parent" },
      { id: "child-2", parentId: "parent" },
    ]

    expect(filterVisibleSidebarSessions(sessions)).toEqual([])
  })
})
