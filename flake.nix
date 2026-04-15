{
  description = "Dekin Video Parser Development Shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
  }:
    flake-utils.lib.eachDefaultSystem (system: let
      pkgs = import nixpkgs {inherit system;};

      python = pkgs.python311;

      # Python deps that ARE in nixpkgs — we take those from Nix.
      # mediapipe is not in nixpkgs (and ships only manylinux/macos wheels),
      # so we install it into a venv layered on top.
      pythonWithBase = python.withPackages (ps: [
        ps.pip
        ps.numpy
        ps.opencv4
      ]);

      venvDir = ".venv";

      bootstrapVenv = ''
        export PYTHON_ROOT="$PWD/python"
        export VENV="$PYTHON_ROOT/${venvDir}"

        if [ ! -d "$VENV" ]; then
          echo "[flake] creating venv at $VENV (layered on nix python)"
          ${pythonWithBase}/bin/python -m venv --system-site-packages "$VENV"
        fi

        # shellcheck disable=SC1091
        source "$VENV/bin/activate"

        if ! python -c "import mediapipe" 2>/dev/null; then
          echo "[flake] installing mediapipe into venv"
          pip install --quiet --disable-pip-version-check \
            "mediapipe>=0.10.14"
        fi

        MODEL="$PYTHON_ROOT/models/pose_landmarker_heavy.task"
        if [ ! -f "$MODEL" ]; then
          echo "[flake] downloading pose_landmarker_heavy.task"
          mkdir -p "$PYTHON_ROOT/models"
          ${pkgs.curl}/bin/curl -L --fail -o "$MODEL" \
            https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task
        fi

        export PYTHON_BIN="$VENV/bin/python"
        export POSE_WORKER_SCRIPT="$PYTHON_ROOT/process_video.py"
        export MEDIAPIPE_POSE_MODEL="$MODEL"
      '';

    in {
      devShells.default = pkgs.mkShell {
        packages = with pkgs; [
          nodejs_22
          pnpm
          ffmpeg
          pkg-config
          openssl
          pythonWithBase
        ];

        shellHook = bootstrapVenv;
      };
    });
}
