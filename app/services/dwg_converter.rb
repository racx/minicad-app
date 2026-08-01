# Converts DWG bytes to DXF text by shelling out to packages/dwg.
#
# That package is GPL-3.0 and is invoked as a SUBPROCESS on purpose — see
# packages/dwg/README.md. Never require or bundle it; the only contract is
# stdin + an output path + the documented exit codes.
class DwgConverter
  Result = Struct.new(:ok, :dxf, :error, :status, keyword_init: true)

  SCRIPT    = Rails.root.join("packages/dwg/convert.mjs").freeze
  MAX_BYTES = ENV.fetch("DWG_MAX_BYTES", (64 * 1024 * 1024).to_s).to_i
  TIMEOUT   = ENV.fetch("DWG_TIMEOUT_SECONDS", "120").to_i
  NODE      = ENV.fetch("NODE_BIN", "node").freeze

  # Shown when the converter itself is at fault — never leak a stack trace or a
  # filesystem path into the drawing window.
  BROKEN = "The DWG converter is not available right now. " \
           "Export a DXF from your CAD program and open that instead."

  def self.call(bytes) = new(bytes).call

  def initialize(bytes)
    @bytes = bytes.to_s
  end

  def call
    return failure("That file is empty.", :bad_request) if @bytes.empty?
    if @bytes.bytesize > MAX_BYTES
      return failure("That file is larger than #{MAX_BYTES / 1_048_576} MB.", :content_too_large)
    end
    return failure(BROKEN, :service_unavailable) unless SCRIPT.exist?

    convert
  end

  private

  def convert
    Dir.mktmpdir("dwg") do |dir|
      out_path = File.join(dir, "out.dxf")
      err, status = run(out_path)

      # The script SIGKILLs itself after writing (a clean exit costs ~3.7s
      # waiting on the wasm thread pool), so a non-empty output FILE is the
      # success signal — not the exit status, and never stdout, which carries
      # the wasm's own diagnostics.
      if File.exist?(out_path) && File.size(out_path) > 0
        return Result.new(ok: true, dxf: File.binread(out_path))
      end

      case status&.exitstatus
      when 2 then failure(err.presence || "That is not a DWG file.", :bad_request)
      when 3 then failure(err.presence || "That DWG could not be read.", :bad_request)
      else
        Rails.logger.error("dwg_convert failed exit=#{status&.exitstatus.inspect} err=#{err.to_s.truncate(500)}")
        failure(BROKEN, :service_unavailable)
      end
    end
  end

  # Returns [last stderr line, Process::Status]. stdout is deliberately drained
  # and discarded — see the note above.
  def run(out_path)
    Open3.popen3(NODE, SCRIPT.to_s, out_path) do |stdin, stdout, stderr, wait|
      stdin.binmode
      writer = Thread.new do
        begin
          stdin.write(@bytes)
        rescue Errno::EPIPE
          # the child rejected the file and exited before reading it all
        ensure
          stdin.close
        end
      end
      noise  = Thread.new { stdout.read }
      err    = +""
      errt   = Thread.new { err << stderr.read }

      unless wait.join(TIMEOUT)
        Process.kill("KILL", wait.pid) rescue nil
        [ writer, noise, errt ].each(&:kill)
        Rails.logger.error("dwg_convert timed out after #{TIMEOUT}s")
        return [ "timeout", nil ]
      end
      [ writer, noise, errt ].each(&:join)
      [ err.strip.lines.last.to_s.strip, wait.value ]
    end
  rescue Errno::ENOENT => e
    Rails.logger.error("dwg_convert could not run #{NODE}: #{e.message}")
    [ "node missing", nil ]
  end

  def failure(message, status) = Result.new(ok: false, error: message, status: status)
end
