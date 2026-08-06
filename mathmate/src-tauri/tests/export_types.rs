// ─── TypeScript type export test ──────────────────────────────────────
// Run with: TS_RS_EXPORT_DIR=../src/lib/types-generated cargo test --features export-types export_types -- --ignored
// This generates TS bindings from Rust wire types into
// ../../src/lib/types-generated/
//
// Each type with #[ts(export, export_to = "...")] writes its .ts file
// when TypeName::export() is called.  The TS trait must be in scope.

#[cfg(feature = "export-types")]
mod exports {
    use ts_rs::TS;
    use mathmate_lib::types_export;

    #[test]
    #[ignore]
    fn export_types() {
        // Session types
        types_export::SessionHeader::export().unwrap();
        types_export::Message::export().unwrap();
        types_export::MessageSegment::export().unwrap();
        types_export::ContentPart::export().unwrap();
        types_export::ToolCallStatus::export().unwrap();
        types_export::SegmentKind::export().unwrap();
        types_export::Session::export().unwrap();

        // Config types (including sub-types referenced by AppConfig)
        types_export::AppConfigModels::export().unwrap();
        types_export::ProviderConfig::export().unwrap();
        types_export::AppConfig::export().unwrap();
        types_export::LaTeXConfig::export().unwrap();
        types_export::SynapseConfig::export().unwrap();
        types_export::VaultConfig::export().unwrap();
        types_export::ChatConfig::export().unwrap();
        types_export::UIConfig::export().unwrap();

        // Memory types
        types_export::MemoryItem::export().unwrap();
        types_export::ScanResult::export().unwrap();
        types_export::ScanResultKind::export().unwrap();
        types_export::SafetyMode::export().unwrap();

        // Tool types
        types_export::ToolDef::export().unwrap();
        types_export::FunctionDef::export().unwrap();
        types_export::ToolCallType::export().unwrap();
        types_export::ToolResultType::export().unwrap();
    }
}
