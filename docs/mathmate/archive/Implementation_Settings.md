# Implementation Plan: Settings & Global System Prompt

## 1. Overview
Introduce a Settings pane that manages a global system prompt with selectable presets. This provides users with control over the AI's persona and behavior without initial complexity of multi-project management.

## 2. Configuration Logic
*   **Storage:** Persist in `~/.mathmate/config.json`.
*   **Presets:**
    *   *Default (Math Tutor):* "You are a patient math tutor. Use KaTeX for formatting sequences of steps. Always show reasoning before the result."
    *   *Formalist:* "You are a rigorous mathematician. Focus on precision, formal logic, and definitions."
    *   *Socratic:* "You are a Socratic tutor. Guide the user through questions rather than providing direct answers."
*   **Persistence:** Use `ConfigurationManager` to observe and save changes.

## 3. UI/UX
*   **SettingsView:**
    *   Sidebar/Window: `SettingsView` (SwiftUI).
    *   Picker for Preset selection.
    *   Editable multi-line text field for the prompt.
*   **Trigger:** Add a toolbar button or menu command for "Settings".

## 4. Technical Tasks
1.  **Model:** Extend `ConfigurationManager` to handle `systemPrompt` state.
2.  **View:** Implement `SettingsView`.
3.  **ViewModel:** Integrate current system prompt into `ChatViewModel` call cycle.
4.  **Integration:** Ensure immediate reactivity when settings change.

## 5. Verification
*   Confirm `swift build` passes after modifications.
*   Verify prompt change takes effect on subsequent messages in the same session.
