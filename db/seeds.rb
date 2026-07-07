# Demo content: four drawings authored as MScript (db/seeds/drawings/*.mscript)
# and generated through the engine package face — no hand-written entity JSON
# anywhere. The node runner ABORTS on any script error, so broken demos can't
# land. Idempotent: re-running updates the demo user's drawings by title.
require "json"
require "open3"

demo = User.find_or_create_by!(email: "demo@minicad.local") do |u|
  u.name = "Demo Architect"
  u.google_uid = "demo:demo@minicad.local"
  u.plan = "beta"
  u.password = SecureRandom.hex(32)
end

out, err, status = Open3.capture3("node", "db/seeds/build_drawings.mjs", chdir: Rails.root.to_s)
abort("Seed drawing build FAILED — nothing was written:\n#{err}") unless status.success?

rows = JSON.parse(out).map do |d|
  drawing = demo.drawings.find_or_initialize_by(title: d["title"])
  drawing.update!(doc: d["doc"], units: d["doc"]["units"])
  [ d["sheet"] || "—", d["title"], d["doc"]["entities"].size, d["areas"] ]
end

puts
puts format("%-7s %-34s %8s  %s", "SHEET", "TITLE", "ENTITIES", "AREA READBACKS")
rows.each do |sheet, title, n, areas|
  puts format("%-7s %-34s %8d  %s", sheet, title, n, areas.first.to_s)
  areas.drop(1).each { |a| puts format("%-7s %-34s %8s  %s", "", "", "", a) }
end
puts "Demo drawings seeded for #{demo.email}."
