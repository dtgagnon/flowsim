{
  description = "FlowSim — fluid simulation for medical device test loops";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAllSystems = f:
        nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          name = "flowsim-dev";

          packages = with pkgs; [
            nodejs_20
            nodePackages.typescript-language-server
          ];

          shellHook = ''
            echo ""
            echo "  FlowSim dev environment"
            echo "  ----------------------------------------"
            echo "  node    $(node --version)"
            echo "  npm     $(npm --version)"
            echo ""
            echo "  First run:  npm install"
            echo "  Dev server: npm run dev"
            echo "  Build:      npm run build"
            echo "  Preview:    npm run preview"
            echo ""
          '';
        };
      });
    };
}
