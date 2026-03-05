{
  description = "Dev shell for video-parser (NestJS + Prisma on NixOS)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forEachSystem = f:
        nixpkgs.lib.genAttrs systems (system:
          f {
            pkgs = import nixpkgs { inherit system; };
          });
    in
    {
      devShells = forEachSystem ({ pkgs }: {
        default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_22
            nodePackages.npm
            prisma-engines
            pkg-config
            openssl
          ];

          shellHook = ''
            export PRISMA_SCHEMA_ENGINE_BINARY="${pkgs.prisma-engines}/bin/schema-engine"
            export PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1

            # nixpkgs variants differ: some expose only schema-engine.
            if [ -x "${pkgs.prisma-engines}/bin/query-engine" ]; then
              export PRISMA_QUERY_ENGINE_BINARY="${pkgs.prisma-engines}/bin/query-engine"
            fi
            if [ -x "${pkgs.prisma-engines}/bin/prisma-fmt" ]; then
              export PRISMA_FMT_BINARY="${pkgs.prisma-engines}/bin/prisma-fmt"
            fi
          '';
        };
      });
    };
}
