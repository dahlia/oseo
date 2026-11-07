pnpm workspace and dependency skills
====================================

Status
------

Accepted. Supersedes the JavaScript package-manager choice in
[ADR 0001](./0001-initial-platform-and-tools.md).


Context
-------

Oseo needs a maintained package manager that preserves exact dependency
resolution and supports the workspace under Node.js and Deno. Version 12 of
pnpm is implemented in Rust and can install Agent Skills bundled with
dependencies. The mise CLI remains the entry point for tools and repository
tasks.


Required contract
-----------------

A clean checkout must install dependencies before its first `mise run`.
Ordinary tasks must reject a stale lockfile. Package archives must retain
the same release manifests and required files. Dependency skills must stay
aligned with their packages without entering Git.


Alternatives considered
-----------------------

Keeping aube would avoid lockfile conversion but
would not provide pnpm's dependency skill installation. Running a separate
skill installer would add another dependency and synchronization step.
An unfrozen install on every task would allow unintended dependency changes.


Probe evidence
--------------

*mise.toml* pins pnpm 12.18.0. The workspace manifest and generated
*pnpm-lock.yaml* define the dependency inputs. Reproduce installation with
`mise install` and `mise deps`; `mise run check`, `mise run build`, and
`mise run check:packages` validate the toolchain and staged package archives.
The package tests run under both Node.js and Deno.


Observed results
----------------

The first pnpm install repaired the previous lockfile's workspace links without
changing any resolved package version or integrity. The separate Optique update
from 1.1.1 to 1.2.13 provides its bundled `optique` skill. The install linked
that skill into both configured agent directories. The installed pnpm
executable is a native binary; Node.js remains available for workspace tools
and the CLI.


Decision
--------

Use pnpm, pinned through mise, for workspace dependency changes. The
`[deps.pnpm]` provider runs `pnpm install --frozen-lockfile` when the root or
package manifests, workspace configuration, or lockfile change, or when
*node\_modules/* is missing. `pnpm exec` runs workspace tools and rejects
stale dependencies rather than installing them itself.

Approve only Optique's named `optique` skill in *pnpm-workspace.yaml* and
link it into *.agents/skills/* and *.claude/skills/*. Both directories are
generated and ignored by Git. Contributors review new skills before approval
and use a frozen install to refresh links. Deno continues to use the
*node\_modules/* tree that pnpm installs.


Consequences
------------

The lockfile change invalidates native harness and test262 fragment cache
identities. Their complete observation update and candidate CI remain separate
integration checks. Historical package-manager measurements remain unchanged;
they are not pnpm performance measurements.

Staged package checks use `pnpm --ignore-workspace pack`, so a workspace above
the temporary directory cannot alter the package being checked. Tool upgrades
continue to be explicit changes to the mise pin and dependency lockfile.


Failure modes and replacement triggers
--------------------------------------

Revisit this decision if a pinned pnpm release cannot install the frozen
workspace, preserve Node.js and Deno behavior, produce valid package archives,
or link the approved dependency skills on supported development hosts.


Links
-----

 -  [pnpm 12.18 release]
 -  [mise dependency providers]
 -  [pnpm Agent Skills]
 -  [*CONTRIBUTING.md*](../../CONTRIBUTING.md)

[pnpm 12.18 release]: https://github.com/pnpm/pnpm/releases/tag/v12.18.0
[mise dependency providers]: https://mise.jdx.dev/dev-tools/deps
[pnpm Agent Skills]: https://pnpm.io/agent-skills
