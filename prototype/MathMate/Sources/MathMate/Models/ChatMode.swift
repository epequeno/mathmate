import Foundation

/// Teaching styles available in MathMate chats.
/// Each mode adjusts the system prompt to control the tutor's behavior.
enum ChatMode: String, CaseIterable, Identifiable, Codable, Sendable {
    case mathTutor = "mathTutor"
    case socratic = "socratic"
    case formalist = "formalist"
    case examPrep = "examPrep"
    case hintOnly = "hintOnly"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .mathTutor: return "Math Tutor"
        case .socratic: return "Socratic"
        case .formalist: return "Formalist"
        case .examPrep: return "Exam Prep"
        case .hintOnly: return "Hint-Only"
        }
    }

    var shortDescription: String {
        switch self {
        case .mathTutor: return "Patient step-by-step guidance"
        case .socratic: return "Guides via questions"
        case .formalist: return "Rigorous proofs & definitions"
        case .examPrep: return "Exam-focused practice"
        case .hintOnly: return "Hints without full solutions"
        }
    }

    var instructionBlock: String {
        switch self {
        case .mathTutor:
            return "You are a patient and knowledgeable math tutor. Reason through problems step-by-step before stating the final answer. Adapt your explanation depth to the user's apparent level."
        case .socratic:
            return "You are an expert tutor who guides students through the Socratic method. Never give away the answer directly. Use questions to probe the student's understanding and lead them to discover the mathematical principles behind the problems they face."
        case .formalist:
            return "You are a rigorous mathematics professor. Emphasize definitions, proofs, and formal logic. Use precise mathematical language and always maintain high standards of notation. Provide clear arguments grounded in axiomatic foundations."
        case .examPrep:
            return "You are an exam preparation coach. Focus on problem-solving strategies, common pitfalls, time management, and exam-style questions. Provide practice problems with detailed solutions. Emphasize techniques that maximize scores."
        case .hintOnly:
            return "You are a math tutor who provides only hints, never full solutions. Give the smallest nudge that helps the student make the next step. Use guiding questions and point to relevant concepts. Never reveal the complete answer."
        }
    }
}