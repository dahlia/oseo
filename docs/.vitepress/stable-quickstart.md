Download the standalone CLI
---------------------------

To install without a package manager, download the Oseo {{VERSION}} archive
for your platform into an empty directory:

 -  [Linux x86\_64 (GNU)]
 -  [macOS (Apple Silicon)]

Extract the archive and check the version:

~~~~ sh
tar -xjf oseo-{{VERSION}}-*.tar.bz2
./oseo --version
~~~~

Run `./oseo` from that directory, or move the executable to a directory on
your `PATH` to run it as `oseo`. See the [GitHub release] for release notes
and other artifacts.

[Linux x86\_64 (GNU)]: https://github.com/dahlia/oseo/releases/download/{{VERSION}}/oseo-{{VERSION}}-linux-x86_64-gnu.tar.bz2
[macOS (Apple Silicon)]: https://github.com/dahlia/oseo/releases/download/{{VERSION}}/oseo-{{VERSION}}-macos-aarch64.tar.bz2
[GitHub release]: https://github.com/dahlia/oseo/releases/tag/{{VERSION}}
