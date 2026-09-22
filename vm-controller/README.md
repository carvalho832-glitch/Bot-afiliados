# Achou Levou VM Controller

Microserviço mínimo para Cloud Run que usa a identidade de serviço do próprio
Cloud Run. Nenhuma chave JSON de conta de serviço é necessária.

Rotas:

- `GET /health`: pública, não revela segredos.
- `GET /status`: requer `Authorization: Bearer <VM_ADMIN_TOKEN>`.
- `POST /start`: requer o mesmo token e só inicia a VM quando o estado é
  `TERMINATED`.

Não existem rotas de stop, delete, reset ou execução genérica.

Variáveis:

```
GCP_PROJECT_ID=project-c3499524-9315-4978-83c
GCP_VM_ZONE=us-central1-c
GCP_VM_INSTANCE=achou-levou-julio
VM_ADMIN_TOKEN=<segredo>
```

O serviço deve executar usando a conta de serviço
`achou-levou-vm-starter@project-c3499524-9315-4978-83c.iam.gserviceaccount.com`,
que possui somente `compute.instances.get` e `compute.instances.start` na VM
do Júlio.
