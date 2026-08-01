require "test_helper"

# POST /api/dwg — DWG→DXF conversion. The converter itself is a GPL subprocess
# (packages/dwg); these tests cover the endpoint contract and the refusal
# messages users actually see. The one real conversion is tagged :slow-ish but
# runs by default because it is the only proof the wiring works end to end.
class DwgImportTest < ActionDispatch::IntegrationTest
  # smallest thing that passes the "AC" + 4 digits version sniff
  FAKE_DWG = ("AC1018" + ("\0" * 64)).b

  def post_dwg(bytes)
    post api_dwg_path, params: bytes, headers: { "CONTENT_TYPE" => "application/octet-stream" }
  end

  test "works signed out, because /try is anonymous" do
    post_dwg "not a dwg"
    assert_response :bad_request
    assert_match(/not a DWG/i, JSON.parse(response.body)["error"])
  end

  test "an empty body is refused in plain language" do
    post_dwg ""
    assert_response :bad_request
    assert_match(/empty/i, JSON.parse(response.body)["error"])
  end

  test "a DXF sent to the DWG endpoint is told where to go" do
    post_dwg "  0\nSECTION\n  2\nENTITIES\n"
    assert_response :bad_request
    assert_match(/DXF/i, JSON.parse(response.body)["error"])
  end

  test "a file with a valid stamp but garbage body is refused, not crashed" do
    post_dwg FAKE_DWG
    assert_response :bad_request
    assert_match(/could not be read|damaged/i, JSON.parse(response.body)["error"])
  end

  test "oversized uploads are refused before running the converter" do
    original = DwgConverter::MAX_BYTES
    DwgConverter.send(:remove_const, :MAX_BYTES)
    DwgConverter.const_set(:MAX_BYTES, 16)
    post_dwg FAKE_DWG
    assert_response :content_too_large
    assert_match(/larger than/i, JSON.parse(response.body)["error"])
  ensure
    DwgConverter.send(:remove_const, :MAX_BYTES)
    DwgConverter.const_set(:MAX_BYTES, original)
  end

  test "error responses never leak paths or stack traces at the user" do
    post_dwg FAKE_DWG
    body = JSON.parse(response.body)["error"]
    assert_not_includes body, Rails.root.to_s
    assert_not_includes body, "packages/"
    assert_no_match(/#<|\.rb:|\.mjs:/, body)
  end

  # The real thing: a genuine R2000 DWG must come back as parseable DXF.
  test "converts a real DWG to DXF" do
    dwg = Rails.root.join("test/fixtures/files/sample.dwg")
    skip "no sample.dwg fixture" unless dwg.exist?

    post_dwg dwg.binread
    assert_response :success
    assert_equal "application/dxf", response.media_type

    body = response.body
    assert_operator body.bytesize, :>, 1000
    # a DXF starts with a group code, and must contain the entities section —
    # this also catches the wasm printing diagnostics into the payload
    assert_match(/\A\s*\d+\r?\n/, body[0, 32])
    assert_includes body, "ENTITIES"
    assert_not_includes body[0, 200], "error code"
  end
end
