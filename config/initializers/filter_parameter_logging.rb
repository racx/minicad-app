# Be sure to restart your server when you modify this file.

# Configure parameters to be partially matched (e.g. passw matches password) and filtered from the log file.
# Use this to limit dissemination of sensitive information.
# See the ActiveSupport::ParameterFilter documentation for supported notations and behaviors.
Rails.application.config.filter_parameters += [
  :passw, :email, :secret, :token, :_key, :crypt, :salt, :certificate, :otp, :ssn, :cvv, :cvc
]

# Not sensitive — just enormous. The editor autosaves the whole drawing on a
# PATCH, and an imported house plan is 22,000 entities of JSON. Logged in full
# it scrolls a development terminal off the screen every few seconds and buries
# everything worth reading. Matches doc/doc_json/document alike.
Rails.application.config.filter_parameters += [ :doc ]
