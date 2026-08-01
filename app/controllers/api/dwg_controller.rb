module Api
  # POST /api/dwg  — raw .dwg bytes in, DXF text out.
  #
  # The browser cannot read DWG itself: the only good open-source reader is
  # GPL-3.0, and shipping it to the client would relicense MiniCAD. Conversion
  # therefore happens here, in a subprocess. See packages/dwg/README.md.
  class DwgController < ApplicationController
    # /try is anonymous, so opening a DWG must work signed-out too. Nothing here
    # reads or writes user data — bytes in, DXF out.
    skip_before_action :authenticate_user!

    def create
      result = DwgConverter.call(request.body.read)

      if result.ok
        Rails.logger.info("dwg_convert user=#{current_user&.id} → #{result.dxf.bytesize} bytes DXF")
        render plain: result.dxf, content_type: "application/json"
      else
        render json: { error: result.error }, status: result.status
      end
    end
  end
end
