#!/usr/bin/env bash
set -Eeuo pipefail
apply(){
 local tool="$1"
 "$tool" -N WTG-HOST-IN 2>/dev/null || true
 "$tool" -F WTG-HOST-IN
 "$tool" -A WTG-HOST-IN -i lo -j ACCEPT
 "$tool" -A WTG-HOST-IN -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
 "$tool" -A WTG-HOST-IN -p tcp -m multiport --dports 22,80,443 -j ACCEPT
 if test "$tool" = iptables;then "$tool" -A WTG-HOST-IN -p icmp -j ACCEPT;else "$tool" -A WTG-HOST-IN -p ipv6-icmp -j ACCEPT;fi
 "$tool" -A WTG-HOST-IN -j DROP
 "$tool" -C INPUT -j WTG-HOST-IN 2>/dev/null || "$tool" -I INPUT 1 -j WTG-HOST-IN
}
apply iptables
if command -v ip6tables >/dev/null;then apply ip6tables;fi
# Docker-published ports pass FORWARD; only gateway 80/443 are published by this stack.
