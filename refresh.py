#!/usr/bin/env python3
"""Refresh the dynamic values on profile.svg. Needs GH_TOKEN; stdlib only.

Token Spend is left alone: it comes from local Claude Code data on the owner's Mac.
"""
import json
import os
import re
import sys
import urllib.request
from datetime import date

LOGIN = "westsoever"
SVG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "profile.svg")
CW = 8.4  # monospace char width at font-size 14, same as the original generator
BIRTH = date(2001, 8, 1)  # birth month and year only; the day is left out on purpose

QUERY = """query($login: String!, $after: String) {
  user(login: $login) {
    id
    followers { totalCount }
    repositories(first: 100, after: $after, ownerAffiliations: OWNER) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes { stargazerCount defaultBranchRef { target { ... on Commit { history(author: {id: $id}) { totalCount } } } } }
    }
  }
}"""


def gql(query, **variables):
    req = urllib.request.Request(
        "https://api.github.com/graphql",
        data=json.dumps({"query": query, "variables": variables}).encode(),
        headers={"Authorization": f"bearer {os.environ['GH_TOKEN']}", "User-Agent": LOGIN},
    )
    body = json.load(urllib.request.urlopen(req))
    if body.get("errors"):
        sys.exit(f"GraphQL error: {body['errors']}")
    return body["data"]


def stats():
    uid = gql("query($login: String!) { user(login: $login) { id } }", login=LOGIN)["user"]["id"]
    q = QUERY.replace("$after: String)", "$after: String, $id: ID!)")
    stars = commits = 0
    after = None
    while True:
        u = gql(q, login=LOGIN, after=after, id=uid)["user"]
        repos = u["repositories"]
        for n in repos["nodes"]:
            stars += n["stargazerCount"]
            ref = n["defaultBranchRef"]  # None for empty repos
            commits += ref["target"]["history"]["totalCount"] if ref else 0
        if not repos["pageInfo"]["hasNextPage"]:
            break
        after = repos["pageInfo"]["endCursor"]
    # Commits = own commits on each repo's default branch; GitHub's own total hides private ones.
    return {
        "Repos": f"{repos['totalCount']:,}",
        "Stars": f"{stars:,}",
        "Commits": f"{commits:,}",
        "Followers": f"{u['followers']['totalCount']:,}",
    }


def uptime(t):  # same arithmetic as the original generator
    b = BIRTH
    y = t.year - b.year - ((t.month, t.day) < (b.month, b.day))
    m = (t.month - b.month - (t.day < b.day)) % 12
    anchor = date(b.year + y + (b.month + m - 1) // 12, (b.month + m - 1) % 12 + 1, b.day)
    return f"{y} years, {m} months, {(t - anchor).days} days"


def pattern(key):
    # label text, right-aligned value text, then the dotted leader whose x2 depends on the value length
    return re.compile(
        rf'(>{re.escape(key)}:</text>\n<text x="([\d.]+)"[^>]*>)([^<]*)(</text>\n<line x1="[\d.]+" x2=")([\d.]+)(")'
    )


def render(svg, values):
    for key, v in values.items():
        def sub(m):
            x2 = float(m[2]) - (len(v) + 1) * CW  # float repr matches the original f-string output
            return f"{m[1]}{v}{m[4]}{x2}{m[6]}"
        svg, n = pattern(key).subn(sub, svg)
        assert n == 1, f"{key!r} matched {n} times in profile.svg"
    return svg


def main():
    svg = open(SVG).read()
    keys = ["Uptime", "Repos", "Stars", "Commits", "Followers"]
    # Self-check: re-rendering today's values must be a no-op, else the layout formula has drifted.
    current = {k: pattern(k).search(svg)[3] for k in keys}
    assert render(svg, current) == svg, "layout formula no longer reproduces profile.svg"

    new = {"Uptime": uptime(date.today()), **stats()}
    for k in keys:
        print(f"{k:10} {current[k]:>28} -> {new[k]}")
    out = render(svg, new)
    if out == svg:
        print("no change")
        return
    open(SVG, "w").write(out)
    print("profile.svg updated")


if __name__ == "__main__":
    main()
