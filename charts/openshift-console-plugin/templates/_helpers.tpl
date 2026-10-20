{{/*
Expand the name of the chart.
*/}}
{{- define "openshift-console-plugin.name" -}}
{{- default (default .Chart.Name .Release.Name) .Values.plugin.name | trunc 63 | trimSuffix "-" }}
{{- end }}


{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "openshift-console-plugin.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "openshift-console-plugin.labels" -}}
helm.sh/chart: {{ include "openshift-console-plugin.chart" . }}
{{ include "openshift-console-plugin.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "openshift-console-plugin.selectorLabels" -}}
app: {{ include "openshift-console-plugin.name" . }}
app.kubernetes.io/name: {{ include "openshift-console-plugin.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/part-of: {{ include "openshift-console-plugin.name" . }}
{{- end }}

{{/*
Create the name secret containing the certificate
*/}}
{{- define "openshift-console-plugin.certificateSecret" -}}
{{ default (printf "%s-cert" (include "openshift-console-plugin.name" .)) .Values.plugin.certificateSecretName }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "openshift-console-plugin.serviceAccountName" -}}
{{- if .Values.plugin.serviceAccount.create }}
{{- default (include "openshift-console-plugin.name" .) .Values.plugin.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.plugin.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Create the name of the patcher
*/}}
{{- define "openshift-console-plugin.patcherName" -}}
{{- printf "%s-patcher" (include "openshift-console-plugin.name" .) }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "openshift-console-plugin.patcherServiceAccountName" -}}
{{- if .Values.plugin.patcherServiceAccount.create }}
{{- default (printf "%s-patcher" (include "openshift-console-plugin.name" .)) .Values.plugin.patcherServiceAccount.name }}
{{- else }}
{{- default "default" .Values.plugin.patcherServiceAccount.name }}
{{- end }}
{{- end }}
{{/*
JSON index of the configured addons, validated so a bad name can't break the mount paths.
*/}}
{{- define "openshift-console-plugin.addonsIndex" -}}
{{- $names := list -}}
{{- range .Values.plugin.addons -}}
{{- if not (regexMatch "^[a-z0-9]([-a-z0-9]*[a-z0-9])?$" (toString .name)) -}}
{{- fail (printf "plugin.addons: invalid name %q (lowercase letters, digits and '-' only)" (toString .name)) -}}
{{- end -}}
{{- if gt (len .name) 57 -}}
{{- fail (printf "plugin.addons: name %q is longer than 57 characters" .name) -}}
{{- end -}}
{{- if has .name $names -}}
{{- fail (printf "plugin.addons: duplicate name %q" .name) -}}
{{- end -}}
{{- if not .volume -}}
{{- fail (printf "plugin.addons: %q has no volume" .name) -}}
{{- end -}}
{{- $names = append $names .name -}}
{{- end -}}
{{- dict "addons" $names | toJson -}}
{{- end -}}
