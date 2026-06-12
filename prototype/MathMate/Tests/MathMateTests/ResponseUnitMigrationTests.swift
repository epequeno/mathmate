import XCTest
@testable import MathMate

final class ResponseUnitMigrationTests: XCTestCase {

    // MARK: - ResponseUnit Tests

    func testResponseUnitCreation() {
        let unit = ResponseUnit(type: .explanation, parts: [.text("Hello")])
        XCTAssertEqual(unit.type, .explanation)
        XCTAssertEqual(unit.parts.count, 1)
        XCTAssertFalse(unit.isFlagged)
        XCTAssertEqual(unit.displayLabel, "Explanation")
    }

    func testResponseUnitDefaultLabels() {
        XCTAssertEqual(ResponseUnitType.thinking.defaultLabel, "Thinking")
        XCTAssertEqual(ResponseUnitType.explanation.defaultLabel, "Explanation")
        XCTAssertEqual(ResponseUnitType.toolBlock.defaultLabel, "Tools")
        XCTAssertEqual(ResponseUnitType.quizCard.defaultLabel, "Quiz")
        XCTAssertEqual(ResponseUnitType.hint.defaultLabel, "Hint")
        XCTAssertEqual(ResponseUnitType.solutionReveal.defaultLabel, "Solution")
        XCTAssertEqual(ResponseUnitType.summary.defaultLabel, "Summary")
        XCTAssertEqual(ResponseUnitType.image.defaultLabel, "Image")
    }

    func testResponseUnitTypeRawValues() {
        XCTAssertEqual(ResponseUnitType.thinking.rawValue, "thinking")
        XCTAssertEqual(ResponseUnitType.quizCard.rawValue, "quizCard")
    }

    // MARK: - Message with Units

    func testMessageWithUnits() {
        let unit = ResponseUnit(type: .explanation, parts: [.text("Hello world")])
        let message = Message(units: [unit], isUser: false)

        XCTAssertFalse(message.units.isEmpty)
        XCTAssertEqual(message.units.count, 1)
        XCTAssertEqual(message.units[0].type, .explanation)
        XCTAssertEqual(message.content, "Hello world")
    }

    func testMessageBackwardCompatContent() {
        // Old-style message with flat parts
        let message = Message(contentParts: [.text("Old content")], isUser: true)

        XCTAssertEqual(message.content, "Old content")
        XCTAssertTrue(message.units.isEmpty)
        XCTAssertFalse(message.parts.isEmpty)
    }

    func testMessageAllParts() {
        let unit = ResponseUnit(type: .explanation, parts: [.text("From unit")])
        let message = Message(units: [unit], isUser: false)

        let allParts = message.allParts
        XCTAssertEqual(allParts.count, 1)
    }

    func testMessageAllToolEvents() {
        var unit = ResponseUnit(type: .toolBlock)
        unit.toolEvents = [ToolEvent(toolName: "test", status: .success, summary: "done")]
        let message = Message(units: [unit], isUser: false)

        XCTAssertEqual(message.allToolEvents.count, 1)
        XCTAssertEqual(message.allToolEvents[0].toolName, "test")
    }

    // MARK: - Message Unit Management

    func testAppendUnit() {
        var message = Message(units: [], isUser: false)
        message.appendUnit(.explanation)
        XCTAssertEqual(message.units.count, 1)
        XCTAssertEqual(message.units[0].type, .explanation)
    }

    func testAppendTextToLastUnit() {
        var message = Message(units: [], isUser: false)
        message.appendTextToLastUnit("Hello")
        XCTAssertEqual(message.units.count, 1)
        XCTAssertEqual(message.content, "Hello")

        message.appendTextToLastUnit(" world")
        XCTAssertEqual(message.content, "Hello world")
    }

    func testAppendPartToLastUnit() {
        var message = Message(units: [], isUser: false)
        message.appendPartToLastUnit(.text("Part 1"))
        message.appendPartToLastUnit(.text("Part 2"))
        XCTAssertEqual(message.units.count, 1)
        XCTAssertEqual(message.units[0].parts.count, 2)
    }

    func testAppendToolEventToLastUnit() {
        var message = Message(units: [], isUser: false)
        let event = ToolEvent(toolName: "test", status: .running, summary: "running")
        message.appendToolEventToLastUnit(event)
        XCTAssertEqual(message.units.count, 1)
        XCTAssertEqual(message.units[0].type, .toolBlock)
        XCTAssertEqual(message.units[0].toolEvents.count, 1)
    }

    func testAppendToolEventCreatesToolBlockUnit() {
        var message = Message(units: [ResponseUnit(type: .explanation)], isUser: false)
        let event = ToolEvent(toolName: "test", status: .success, summary: "done")
        message.appendToolEventToLastUnit(event)
        // Should create a new toolBlock unit since last unit is explanation
        XCTAssertEqual(message.units.count, 2)
        XCTAssertEqual(message.units[1].type, .toolBlock)
    }

    // MARK: - Codable Tests

    func testMessageCodableWithUnits() throws {
        let unit = ResponseUnit(type: .explanation, parts: [.text("Test")])
        let original = Message(units: [unit], isUser: false)

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(Message.self, from: data)

        XCTAssertEqual(decoded.units.count, 1)
        XCTAssertEqual(decoded.units[0].type, .explanation)
        XCTAssertEqual(decoded.content, "Test")
    }

    func testMessageCodableBackwardCompat() throws {
        // Test that a message with units can be encoded and decoded
        let unit = ResponseUnit(type: .explanation, parts: [.text("Test content")])
        let original = Message(units: [unit], isUser: false)

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(Message.self, from: data)

        XCTAssertEqual(decoded.content, "Test content")
        XCTAssertEqual(decoded.units.count, 1)
    }

    func testResponseUnitCodable() throws {
        let unit = ResponseUnit(
            type: .quizCard,
            parts: [.text("Quiz content")],
            toolEvents: [],
            isFlagged: true,
            displayLabel: "My Quiz"
        )

        let data = try JSONEncoder().encode(unit)
        let decoded = try JSONDecoder().decode(ResponseUnit.self, from: data)

        XCTAssertEqual(decoded.type, .quizCard)
        XCTAssertEqual(decoded.displayLabel, "My Quiz")
        XCTAssertTrue(decoded.isFlagged)
    }

    // MARK: - Streaming Pipeline Helpers

    func testLastUnit() {
        var message = Message(units: [], isUser: false)
        XCTAssertNil(message.lastUnit)

        message.appendUnit(.explanation)
        message.appendUnit(.toolBlock)
        XCTAssertEqual(message.lastUnit?.type, .toolBlock)
    }

    func testLastUnitIndex() {
        var message = Message(units: [], isUser: false)
        XCTAssertNil(message.lastUnitIndex)

        message.appendUnit(.explanation)
        message.appendUnit(.toolBlock)
        XCTAssertEqual(message.lastUnitIndex, 1)
    }
}
