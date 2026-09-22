# Controle remoto da VM do bot

A API externa do Achou Levou oferece somente duas ações administrativas de Compute Engine:

- `GET /admin/vm/status`: consulta o estado da VM configurada.
- `POST /admin/vm/start`: inicia a VM somente quando o estado é `TERMINATED`.
- `GET /admin/vm/config`: confirma se as variáveis obrigatórias estão configuradas.

Não existe rota de `stop`, `delete` ou execução genérica de comandos.

## Autorização da rota

Configure um segredo forte em `VM_ADMIN_TOKEN`.

As chamadas administrativas precisam enviar:

```
Authorization: Bearer <VM_ADMIN_TOKEN>
```

Se o token não estiver configurado, as rotas permanecem desativadas.

## Alvo da VM

Configure:

```
GCP_PROJECT_ID=
GCP_VM_ZONE=
GCP_VM_INSTANCE=
```

A API nunca escolhe outra VM dinamicamente. O alvo é fixado pelas variáveis acima.

## Autenticação com Google Cloud

### API rodando dentro do Google Cloud

Prefira Application Default Credentials usando uma conta de serviço anexada à VM da API. Não é necessário armazenar chave JSON.

### API rodando fora do Google Cloud

Use uma conta de serviço exclusiva e restrita. O JSON pode ser fornecido pela variável secreta:

```
GCP_SERVICE_ACCOUNT_JSON={...}
```

Nunca grave esse JSON no GitHub.

## Permissões mínimas

A identidade usada pela API precisa, no mínimo, das permissões:

- `compute.instances.get`
- `compute.instances.start`

Crie uma função personalizada com somente essas permissões e conceda-a ao recurso/projeto necessário.

## Comportamento seguro

Antes de iniciar, a API consulta a VM. Se ela já estiver `RUNNING`, `PROVISIONING` ou `STAGING`, nenhuma segunda ação de start é enviada.

A chamada `POST /admin/vm/start` só usa o método `instances.start` quando o estado retornado pelo Google Cloud é `TERMINATED`.

Estados como `SUSPENDED`, `STOPPING` ou outros retornam conflito e exigem intervenção explícita.
