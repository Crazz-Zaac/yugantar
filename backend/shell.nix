{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    python311
    poetry

    # Required for OpenCV
    opencv
    mesa              # provides libGL.so.1
    libGL
    xorg.libX11
    xorg.libXext
    xorg.libSM
    xorg.libICE

    # Compiler/runtime basics
    stdenv.cc.cc.lib
    zlib
  ];

  shellHook = ''
    export LD_LIBRARY_PATH="${
      pkgs.lib.makeLibraryPath [
        pkgs.stdenv.cc.cc.lib
        pkgs.zlib
        pkgs.mesa
        pkgs.libGL
        pkgs.opencv
        pkgs.xorg.libX11
        pkgs.xorg.libXext
        pkgs.xorg.libSM
        pkgs.xorg.libICE
      ]
    }:$LD_LIBRARY_PATH"

    poetry config virtualenvs.in-project true

    if [ ! -d ".venv" ]; then
      poetry install --with dev
    fi

    source .venv/bin/activate

    echo "✅ Environment ready"
  '';
}