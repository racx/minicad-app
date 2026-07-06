require "test_helper"

class DrawingTest < ActiveSupport::TestCase
  setup do
    @drawing = drawings(:plan_a)
  end

  test "record_snapshot writes the first snapshot" do
    assert_difference "@drawing.snapshots.count", 1 do
      @drawing.record_snapshot
    end
    assert_equal @drawing.doc, @drawing.snapshots.last.doc
  end

  test "record_snapshot is throttled to one per 2 minutes" do
    @drawing.record_snapshot
    assert_no_difference "@drawing.snapshots.count" do
      @drawing.record_snapshot
    end

    travel Drawing::SNAPSHOT_INTERVAL + 1.second do
      assert_difference "@drawing.snapshots.count", 1 do
        @drawing.record_snapshot
      end
    end
  end

  test "record_snapshot prunes history to the newest 50" do
    55.times do |i|
      @drawing.snapshots.create!(doc: { i: i }, created_at: (100 - i).minutes.ago)
    end

    travel_to Time.current do
      @drawing.record_snapshot
    end

    assert_equal Drawing::SNAPSHOTS_KEPT, @drawing.snapshots.count
    # newest survive: the fresh snapshot plus the most recent history
    assert_equal @drawing.doc, @drawing.snapshots.order(created_at: :desc).first.doc
  end

  test "rejects unknown units" do
    @drawing.units = "furlong"
    assert_not @drawing.valid?
  end
end
