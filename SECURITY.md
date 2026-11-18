Security policy
===============

Reporting a vulnerability
-------------------------

Use [GitHub's private vulnerability reporting form][report]. Do not post
vulnerability details in a public issue, pull request, or discussion. A
maintainer will send an initial response within seven days. This is a
response deadline, not a deadline for completing an investigation or a fix.

[report]: https://github.com/dahlia/oseo/security/advisories/new


Security updates before 1.0.0
-----------------------------

Confirmed vulnerabilities are fixed in the next minor release. Security
updates for existing minor lines are not guaranteed, but a maintainer may
ship a fix sooner in a patch release, depending on severity. That fix
also goes into the next minor release.

Maintainers coordinate disclosure with the reporter. Depending on severity
and whether the issue is already public or being exploited, they may keep the
fix private until release or delay disclosing details after the update
becomes available. Before 1.0.0, neither an embargo nor a minimum embargo
period is guaranteed.


Policy for 1.0.0
----------------

Before releasing 1.0.0, the maintainers will publish a policy that specifies
the minimum number of supported minor lines, a first-response deadline shorter
than seven days, and a guaranteed minimum interval between availability of
a security update and publication of vulnerability details. The policy will
state exceptions for cases where waiting would put users at greater risk.
