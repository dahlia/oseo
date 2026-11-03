Licensing correspondence with the FSF
=====================================

Status
------

A summary of a private exchange, kept for
[ADR 0021](../../adr/0021-runtime-linking-exception.md). It records what was
asked and what came back. It is not a license change, and it answers none of
the record's open questions.


Thread
------

GNU RT ticket `#2446621` holds the exchange with the FSF Licensing and
Compliance team. The queue is a request tracker rather than a mailing list, and
its tickets require staff credentials, so there is no public archive.

| Date       | Sender            | Message-ID                                                             |
| ---------- | ----------------- | ---------------------------------------------------------------------- |
| 2026-07-28 | Hong Minhee       | `<9181682d-ba21-4f86-8930-85a7d5797137@me.com>`                        |
| 2026-09-30 | Craig Topham      | `<rt-4.2.16-14-g9a593ee-6569-1790777108-428.2446621-5-0@rt.gnu.org>`   |
| 2026-10-06 | Krzysztof Siewicz | `<rt-4.2.16-14-g9a593ee-18944-1791301341-1923.2446621-5-0@rt.gnu.org>` |
| 2026-10-09 | Hong Minhee       | `<7180dd88-fa82-40bb-bf25-6a86ce7b2c95@me.com>`                        |
| 2026-10-30 | Yoni Rabkin       | `<rt-4.2.16-14-g9a593ee-24339-1793393223-350.2446621-5-0@rt.gnu.org>`  |
| 2026-11-03 | Hong Minhee       | `<8ADC393E-A947-4D45-ABE1-D0AC2DD947D5@minhee.org>`                    |

The subject is “Runtime library exception for an ahead-of-time JavaScript
compiler”. RT adds the ticket tag to the subject on replies.


What the messages say
---------------------

The first message asks two questions: whether the Oseo pipeline is an Eligible
Compilation Process under the GCC Runtime Library Exception 3.1, and whether
the exception reaches built-ins implemented in the compiled subset rather than
in C.

Topham replied on 2026-09-30. Topham's reading was that if the GPLv3 compiler
produces C, that C and its compiled binary contain parts of the original
ECMAScript, and no additional nonfree code enters compilation, then “an
exception like the GCC one makes sense”. Topham added that “we would have to do
more than remove the GCC-specific references”, that the text would need to
describe what happens when the ECMAScript executes, and that the FSF might
publish a new exception alongside the GCC and Autoconf ones. The message opens
with “If I am understanding it correctly” and closes by reassigning the
ticket, so it is a tentative reading rather than a decision.

Siewicz stated the boundary on 2026-10-06: “Unfortunately, the FSF cannot
provide legal advice.” Siewicz offered to explain how the licenses are intended
to apply and suggested consulting a lawyer about the project's particular
situation.

The maintainer's 2026-10-09 follow-up narrowed this to three questions about
the unmodified text: whether the non-GCC branch was written for other
compilers' runtimes, whether runtime code supplied as source is treated like a
linked library, and whether distributing generated C is inside the additional
permission.

Rabkin asked on 2026-10-30 for more detail, in particular why the maintainer
raised an Eligible Compilation Process, and whether “the GPL plugin mechanism”
made the process ineligible.

The 2026-11-03 reply answers the eligibility question. Oseo uses no GCC
component, and no GCC plugin, runtime, or other GCC work enters the pipeline.
The reply then separates four contributions to a generated program, asks
whether distributing generated C that includes the runtime header and
Oseo-authored helper code falls under the additional permission, and asks
whether runtime code supplied as source and compiled with the user's program is
treated like a separately built library.

No answer to those two questions has arrived. Siewicz and Rabkin each say that
their message is not legal advice.


Why the originals are not included
----------------------------------

The message files stay outside the repository for four reasons.

 -  The text belongs to its authors. The repository is `GPL-3.0-only`, every
    package ships an identical *LICENSE*, and the project cannot grant terms
    for third-party text. A summary with short quotations keeps the record
    without importing the full messages.
 -  The messages quote staff-internal remarks and reassignment lines that were
    not written for publication.
 -  The headers carry the maintainer's client IP and mailer version. Removing
    them would produce a file that is no longer the original.
 -  The queue is private, and none of the authors agreed to republication.
    [The Principles of Community-Oriented GPL Enforcement][enforcement] favor
    private handling of licensing correspondence, although they govern
    enforcement rather than routine questions.

Copies are held by the maintainer and can be supplied on request. If the FSF or
an author publishes the thread, link it here and revise the corresponding
sentence in ADR 0021.

[enforcement]: https://www.fsf.org/licensing/enforcement-principles


Links
-----

 -  [ADR 0021](../../adr/0021-runtime-linking-exception.md) is the decision
    record this summary supports.
 -  [FSF licensing] describes `licensing@fsf.org` as the address for general
    licensing questions.

[FSF licensing]: https://www.fsf.org/licensing
