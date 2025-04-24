FROM golang:1.24-alpine
WORKDIR /app
COPY . .
RUN go mod tidy
RUN ls -la internal/api/
RUN grep -n "func (h \*APIHandler)" internal/api/handlers.go
RUN grep -n "handler\." internal/api/routes.go
RUN go build -v ./cmd/server/
CMD ["/app/server"]