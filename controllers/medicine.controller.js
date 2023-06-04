const db = require('../models')

const Medicine = db.medicines.Medicine
const medicineLog = db.medicines.medicineLog
const axios= require('axios')
module.exports =  {

    /* .post /add, JSON { name, manufacturer, description, stock } */
    // stock & price harus sudah berupa int
    create(req, res) {
        if (!(req.body.name 
            && req.body.manufacturer
            && req.body.description
            && req.body.stock
            && req.body.price)) {
            res.status(400).send({
                message: "Semua kolom harus diisi"
            })
        } else {
        const medicine = new Medicine({
            name: req.body.name,
            manufacturer: req.body.manufacturer,
            description: req.body.description,
            stock: req.body.stock,
            price: req.body.price,
            log: [medicineLog(
                req.body.stock,
                'Data obat ditambahkan'
            )]
        })
        medicine.save()
            .then(data => {
                res.send(data)
            })
            .catch(err => {
                res.status(500).send({
                    message:
                    err.message || 'Gagal menambah obat'
                })
            })
        }
    },

    /* .get /, /?id=<id>&name=<name>&manufacturer=<manufacturer>
    optional, jika req.query kosong, send semua isi database */
    findAll(req, res) {
        const query = {}

        if (req.query.name)
            query.name = {
                $regex: new RegExp(req.query.name),
                $options: "i"
            }
        if (req.query.manufacturer)
            query.manufacturer =  {
                $regex: new RegExp(req.query.manufacturer),
                $options: "i"
            }

        Medicine.find(query)
            .then(data => {
                res.send(data)
            })
            .catch(err => {
                res.status(500).send({
                    message:
                    err.message || "Terjadi kesalahan saat mengambil data obat"
                })
            })

    },

    /* .get /:id */
    findOne(req, res) {
        const id = req.params.id

        Medicine.findById(id)
            .then(data => {
                if (!data) {
                    res.status(404).send({
                        message: `Obat dengan id ${id} tidak ditemukan`
                    })
                } else res.send(data)
            })
            .catch(err => {
                res.status(500).send({
                    message: `Gagal mengambil obat dengan id ${id}`
                })
            })
    },

    /* .put /:id JSON { ... }  */
    update(req, res) {
        if (Object.keys(req.body).length === 0) {
            return res.status(400).send({
                message: "Data untuk update tidak boleh kosong"
            })
        }
        const id = req.params.id

        // note: kode inefisien, refactor soon
        // mengupdate "log" secara otomatis jika "stock" diupdate
        if (req.body.stock) {
            Medicine.findById(id)
            .then(data => {
                if (!data) {
                    res.status(404).send({
                        message: `Obat dengan id ${id} tidak ditemukan`
                    })
                } else {
                    const stockIncrement = req.body.stock - parseInt(data.stock)
                    if (stockIncrement != 0) {
                        const newLog = [
                            stockIncrement,
                            "Stok telah di ubah secara manual",
                            new Date().toLocaleString()
                        ]
                        const newTransLog = data.log
                        newTransLog.push(newLog)
                        req.body.log = newTransLog
    
    
                        Medicine.findByIdAndUpdate(id, { $set: req.body }, { useFindAndModify: false })
                        .then(data => {
                            if (!data)
                                res.status(404).send({
                                    message: `Obat dengan id ${id} tidak ditemukan`
                                })
                            else {
                                // updating transaction log if "stock" was also updated
                                res.send({ message: "Obat berhasil diupdate" })
                            }
                        })
                        .catch(err => {
                            res.status(500).send({
                                message:
                                    err.message || `Terjadi kesalahan saat mengupdate obat dengan id ${id}`
                            })
                        })
                    } else updateMedicine()
                    
                }
            })
            .catch(err => {
                res.status(500).send({
                    message: err.message || `Terjadi kesalahan saat mengupdate obat dengan id ${id}`
                })
            })
        } else updateMedicine()
        
        function updateMedicine() {
            Medicine.findByIdAndUpdate(id, { $set: req.body }, { useFindAndModify: false })
                .then(data => {
                    if (!data)
                        res.status(404).send({
                            message: `Obat dengan id ${id} tidak ditemukan`
                        })
                    else {
                        // updating transaction log if "stock" was also updated
                        res.send({ message: "Obat berhasil diupdate" })
                    }
                })
                .catch(err => {
                    res.status(500).send({
                        message:
                            err.message || `Terjadi kesalahan saat mengupdate obat dengan ${id}`
                    })
                })
        }
    },

    /* .put /:id/log JSON { stock, description } */
    addTransactionLog(req, res) {
        const id = req.params.id
        //id obat sebagai URL
        let log, newLog

        /*
           req.body.stock,
           req.body.description
           req.body.total_payment (biaya dibuat sama kamu san (biaya total))


        */
        if ('stock' in req.body
            && typeof req.body.stock === 'number'
            && isFinite(req.body.stock)
            && req.body.stock != 0 ) {

            newLog = [
                req.body.stock,
                req.body.description
                    ? req.body.description
                    : '',
                req.body.date
                    ? req.body.date // format HARUS "MM/DD/YYYY, hh:mm:ss"
                    : new Date().toLocaleString()
            ]

            Medicine.findById(id).then(data => {
                log = data.log
                const updatedStock = data.stock + req.body.stock
                if (updatedStock < 0) 
                    return res.status(400).send({
                        message: 'Stok tidak dapat kurang dari 0'
                    })
                log.push(newLog)

                Medicine.findByIdAndUpdate(id, { $set: { log, stock: updatedStock }})
                .then(data => {
                    if (!data)
                        res.status(404).send({
                            message: `Obat dengan id ${id} tidak ditemukan`
                        })
                    else {
                        //microservice menuju server cashflow
                        const pemasukan = req.body.total_payment;
                        const instansi = "Pharmacy"
                        axios
                        .post("http://localhost:5001/api/transaction/create", { pemasukan, instansi })
                        .then((response) => {
                          res.send(response.data);
                        })
                        .catch((error) => {
                          console.error(error);
                          res.status(500).send("Internal Server Error");
                        });
                         
                        
                        res.send({ message: `Transaksi ditambahkan untuk obat dengan id ${id}` })} 
                })

            }).catch(() => {
                res.status(404).send({
                    message: `Obat dengan id ${id} tidak ditemukan`
                })
            })

        } else return res.status(400).send({
            message: "Tidak dapat menambahkan transaksi kosong"
        })

    },

    /* .get /:id/log */
    getTransactionLog(req, res) {
        const id = req.params.id

        Medicine.findById(id)
            .then(data => {
                if (!data) {
                    res.status(404).send({
                        message: `Obat dengan ${id} tidak ditemukan`
                    })
                } else res.send(data.log)
            })
            .catch(err => {
                res.status(500).send({
                    message: `Gagal mengambil obat dengan id ${id}`
                })
            })
    },

    /* .get /:id/stock  */
    getMedicineStock(req, res) {
        const id = req.params.id

        Medicine.findById(id)
            .then(data => {
                if (!data) {
                    res.status(404).send({
                        message: `Obat dengan id ${id} tidak ditemukan`
                    })
                } else res.send(data.stock)
            })
            .catch(err => {
                res.status(500).send({
                    message: `Gagal mengambil obat dengan id ${id}`
                })
            })
    },

    deleteAll(req,res){
        Medicine.deleteMany({}).then(data =>{
            res.send({message: "Semua obat telah dihapus"})
        })
        .catch(err => {
            res.status(500).send({
                message: err.message || "Hapus gagal"
            })
        })
    },

    /* .delete /:id  */
    delete(req, res) {
        const id = req.params.id

        Medicine.findByIdAndDelete(id)
            .then(data => {
                if (!data) {
                    res.status(404).send({
                    message: `Tidak dapat menghapus obat dengan id=${id}`
                    })
                } else {
                    res.send({
                    message: `Obat dengan id ${id} berhasil dihapus!`
                    })
                }
            })
            .catch(err => {
                res.status(500).send({
                    message: `Tidak dapat menghapus obat dengan id ${id}`
                })
            })
    }
}