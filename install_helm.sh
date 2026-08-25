#!/usr/bin/env bash

USE_SUDO="false"
HELM_INSTALL_DIR="/tmp"

curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/v4.2.4/scripts/get-helm-3
chmod 700 get_helm.sh
source get_helm.sh

rm -rf get_helm.sh
