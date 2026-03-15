# Homebrew Formula for SkillCapture
# When the user runs `brew install skill-capture`, Homebrew will download the
# Python source, create a virtual environment in libexec, and symlink the binaries.

class SkillCapture < Formula
  include Language::Python::Virtualenv

  desc "Privacy-first AI agent that turns workflows into one-click Skills"
  homepage "https://github.com/YOUR_USERNAME/skill-capture"
  url "https://github.com/YOUR_USERNAME/skill-capture/archive/refs/tags/v1.0.0.tar.gz"
  sha256 "REPLACE_WITH_ACTUAL_SHA256_WHEN_PUBLISHED"
  version "1.0.0"

  depends_on "python@3.11"

  def install
    # Create the virtualenv in libexec and install the current package
    virtualenv_install_with_resources
  end

  test do
    # Verify both executables are installed and return help text successfully
    assert_match "SkillCapture", shell_output("#{bin}/skill-capture-cli --help")
    assert_match "FastMCP", shell_output("#{bin}/skill-capture-mcp --help", 1) # FastMCP exits 1 on help sometimes, or 0. Adjust if needed.
  end
end
